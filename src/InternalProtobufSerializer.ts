import {
    ConcreteTypeDescriptor,
    IndexedObject,
    MapTypeDescriptor,
    NumberType,
    ObjectMemberMetadata,
    ObjectMetadata,
    SerializableMemberOptions,
    Serializer,
    TypeDescriptor,
    TypedJSON,
} from '@openhps/core';
import { Type } from 'protobufjs';
import { AnyT, JsonObjectMetadata } from 'typedjson';
import * as protobuf from 'protobufjs';
import Long from 'long';

export class InternalProtobufSerializer extends Serializer {
    protected static primitiveWrapper: Type;

    constructor() {
        super();
        this.setSerializationStrategy(
            Number,
            (
                obj: number,
                typeDescriptor: TypeDescriptor,
                memberName: string,
                serializer: InternalProtobufSerializer,
                memberOptions: SerializableMemberOptions,
            ) => {
                switch (memberOptions.numberType) {
                    case NumberType.LONG:
                        return Long.fromNumber(obj);
                    default:
                        return obj;
                }
            },
        );
        this.setSerializationStrategy(Map, this.convertAsMap.bind(this));
        InternalProtobufSerializer.primitiveWrapper = new protobuf.Type('PrimitiveWrapperMessage');
        InternalProtobufSerializer.primitiveWrapper.add(new protobuf.Field('value', 1, 'string'));
    }

    convertSingleValue(
        sourceObject: any,
        typeDescriptor: TypeDescriptor,
        memberName?: string,
        memberOptions?: ObjectMemberMetadata,
        serializerOptions?: any,
    ): any {
        if (this.retrievePreserveNull(memberOptions) && sourceObject === null) {
            return null;
        }
        if (!TypedJSON.utils.isValueDefined(sourceObject)) {
            return;
        }

        if (!TypedJSON.utils.isInstanceOf(sourceObject, typeDescriptor.ctor)) {
            const expectedName = TypedJSON.utils.nameof(typeDescriptor.ctor);
            const actualName = TypedJSON.utils.nameof(sourceObject.constructor);

            this.errorHandler(
                new TypeError(
                    `Could not serialize '${memberName}': expected '${expectedName}',` + ` got '${actualName}'.`,
                ),
            );
            return;
        }

        const serializer = this.serializationStrategy.get(typeDescriptor.ctor);
        if (serializer !== undefined) {
            return serializer(sourceObject, typeDescriptor, memberName, this, memberOptions, serializerOptions);
        }
        // if not present in the strategy do property by property serialization
        if (typeof sourceObject === 'object') {
            return this.convertAsObject(
                sourceObject,
                typeDescriptor,
                memberName,
                this,
                memberOptions,
                serializerOptions,
            );
        }

        let error = `Could not serialize '${memberName}'; don't know how to serialize type`;

        if (typeDescriptor.hasFriendlyName()) {
            error += ` '${typeDescriptor.ctor.name}'`;
        }

        this.errorHandler(new TypeError(`${error}.`));
    }

    convertAsObject(
        sourceObject: IndexedObject,
        typeDescriptor: ConcreteTypeDescriptor,
        memberName: string,
        serializer: InternalProtobufSerializer,
        memberOptions?: ObjectMemberMetadata,
        serializerOptions?: any,
    ) {
        const typeMetadata: ObjectMetadata | undefined = JsonObjectMetadata.getFromConstructor(typeDescriptor.ctor);
        let sourceTypeMetadata: ObjectMetadata | undefined = JsonObjectMetadata.getFromConstructor(
            sourceObject.constructor,
        );

        if (!sourceTypeMetadata) {
            sourceTypeMetadata = typeMetadata;
        }

        let targetObject: IndexedObject;

        if (sourceTypeMetadata === undefined) {
            // Untyped serialization, "as-is", we'll just pass the object on.
            // We'll clone the source object, because type hints are added to the object itself, and we
            // don't want to modify
            // to the original object.
            targetObject = { ...sourceObject };
        } else {
            const sourceMeta = sourceTypeMetadata;
            // Strong-typed serialization available.
            // We'll serialize by members that have been marked with @jsonMember (including
            // array/set/map members), and perform recursive conversion on each of them. The converted
            // objects are put on the 'targetObject', which is what will be put into 'JSON.stringify'
            // finally.
            targetObject = {};

            const classOptions = TypedJSON.options.mergeOptions(serializer.options, sourceMeta.options);
            sourceMeta.dataMembers.forEach((objMemberMetadata) => {
                const objMemberOptions = TypedJSON.options.mergeOptions(classOptions, objMemberMetadata.options);
                let serialized;
                if (objMemberMetadata.type == null) {
                    throw new TypeError(
                        `Could not serialize ${objMemberMetadata.name}, there is` +
                            ` no constructor nor serialization function to use.`,
                    );
                } else {
                    const MessageType = sourceTypeMetadata.protobuf.messageType;
                    const field = MessageType.get(objMemberMetadata.key);
                    serialized = this.convertSingleValue(
                        sourceObject[objMemberMetadata.key],
                        objMemberMetadata.type(),
                        `${TypedJSON.utils.nameof(sourceMeta.classType)}.${objMemberMetadata.key}`,
                        objMemberOptions,
                        {
                            ...serializerOptions,
                            field
                        },
                    );
                }

                if (TypedJSON.utils.isValueDefined(serialized)) {
                    if (objMemberMetadata.type() === AnyT) {
                        const MessageType = serializerOptions.types.get(
                            sourceObject[objMemberMetadata.key].constructor.name,
                        ) as protobuf.Type;
                        if (MessageType) {
                            const message = MessageType.fromObject(serialized);
                            serialized = {
                                type_url: sourceObject[objMemberMetadata.key].constructor.name,
                                value: MessageType.encode(message).finish(),
                            };
                        } else {
                            const message = InternalProtobufSerializer.primitiveWrapper.fromObject({
                                value: sourceObject[objMemberMetadata.key],
                            });
                            serialized = {
                                type_url: sourceObject[objMemberMetadata.key].constructor.name,
                                value: InternalProtobufSerializer.primitiveWrapper.encode(message).finish(),
                            };
                        }
                    }
                    targetObject[objMemberMetadata.name] = serialized;
                }
            });

            if (serializerOptions.field && serializerOptions.field.type !== 'google.protobuf.Any') {
                const MessageType = sourceTypeMetadata.protobuf.messageType;
                const message = MessageType.create({
                    ...targetObject,
                    _type: sourceTypeMetadata.protobuf.messageTypeEnum
                });
                targetObject = message;
            } else if (typeMetadata.knownTypes.size > 1 && memberName) {
                const MessageType = sourceTypeMetadata.protobuf.messageType;
                const message = MessageType.create(targetObject);
                targetObject = {
                    type_url: sourceObject.constructor.name,
                    value: MessageType.encode(message).finish(),
                };
            }
        }
        return targetObject;
    }

    /**
     * Performs the conversion of a map of typed objects (or primitive values) into an array
     * of simple javascript objects with `key` and `value` properties.
     * @param sourceObject
     * @param typeDescriptor
     * @param memberName
     * @param serializer
     * @param memberOptions
     * @param serializerOptions
     */
    convertAsMap(
        sourceObject: Map<any, any>,
        typeDescriptor: MapTypeDescriptor,
        memberName: string,
        serializer: Serializer,
        memberOptions?: ObjectMemberMetadata,
        serializerOptions?: any,
    ): IndexedObject | Array<{ key: any; value: any }> {
        const result = {};
        sourceObject.forEach((value, key) => {
            result[key] = serializer.convertSingleValue(
                value,
                typeDescriptor.valueType,
                memberName,
                memberOptions,
                serializerOptions,
            );
        });
        return result;
    }
}
