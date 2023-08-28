import {
    ConcreteTypeDescriptor,
    IndexedObject,
    MapTypeDescriptor,
    ObjectMemberMetadata,
    ObjectMetadata,
    Serializer,
    TypeDescriptor,
    TypedJSON,
    UUID,
} from '@openhps/core';
import { Type } from 'protobufjs';
import { AnyT, JsonObjectMetadata } from 'typedjson';
import * as protobuf from 'protobufjs';

export class InternalProtobufSerializer extends Serializer {
    protected static primitiveWrapper: Type;

    constructor() {
        super();
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

        const sourceMeta = sourceTypeMetadata;
        targetObject = {};

        const classOptions = TypedJSON.options.mergeOptions(serializer.options, sourceMeta.options);
        sourceMeta.dataMembers.forEach((objMemberMetadata) => {
            const objMemberOptions = TypedJSON.options.mergeOptions(classOptions, objMemberMetadata.options);
            let serialized;
            let memberName = (objMemberOptions && objMemberOptions.protobuf ? objMemberOptions.protobuf.name : objMemberMetadata.name) ?? objMemberMetadata.name;

            if (sourceObject[objMemberMetadata.key] === undefined) {
                return;
            }

            if (objMemberMetadata.type == null) {
                throw new TypeError(
                    `Could not serialize ${objMemberMetadata.name}, there is` +
                        ` no constructor nor serialization function to use.`,
                );
            } else if (objMemberMetadata.name === "uid") {
                const uuid = UUID.fromString(sourceObject[objMemberMetadata.key]);
                if (uuid) {
                    serialized = uuid.toBuffer();
                    memberName += "_bytes";
                } else {
                    serialized = sourceObject[objMemberMetadata.key];
                    memberName += "_string";
                }
            } else {
                const MessageType = sourceTypeMetadata.protobuf.messageType;
                const field = MessageType.get(objMemberMetadata.name);
                serialized = this.convertSingleValue(
                    sourceObject[objMemberMetadata.key],
                    objMemberMetadata.type(),
                    `${TypedJSON.utils.nameof(sourceMeta.classType)}.${objMemberMetadata.key}`,
                    objMemberOptions,
                    {
                        ...serializerOptions,
                        field,
                    },
                );
            }

            if (TypedJSON.utils.isValueDefined(serialized)) {
                if (objMemberMetadata.type() === AnyT) {
                    const MessageType = serializerOptions.types.get(
                        sourceObject[objMemberMetadata.key].constructor.name,
                    ) as protobuf.Type;
                    if (MessageType) {
                        const message = MessageType.create(serialized);
                        serialized = {
                            type_url: sourceObject[objMemberMetadata.key].constructor.name,
                            value: MessageType.encode(message).finish(),
                        };
                    } else {
                        const message = InternalProtobufSerializer.primitiveWrapper.create({
                            value: String(sourceObject[objMemberMetadata.key]),
                        });
                        serialized = {
                            type_url: sourceObject[objMemberMetadata.key].constructor.name,
                            value: InternalProtobufSerializer.primitiveWrapper.encode(message).finish(),
                        };
                    }
                }
                targetObject[memberName] = serialized;
            }
        });

        const isAnyField = serializerOptions.field && serializerOptions.field.type === 'google.protobuf.Any';
        if (!isAnyField && typeMetadata.knownTypes.size > 1) {
            const MessageType = sourceTypeMetadata.protobuf.messageType;
            const message = MessageType.create({
                ...targetObject,
                _type: sourceTypeMetadata.protobuf.messageTypeEnum,
            });
            targetObject = message;
        } else if (isAnyField) {
            const MessageType = sourceTypeMetadata.protobuf.messageType;
            const message = MessageType.create(targetObject);
            targetObject = {
                type_url: sourceObject.constructor.name,
                value: MessageType.encode(message).finish(),
            };
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
