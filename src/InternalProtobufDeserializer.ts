import {
    ConcreteTypeDescriptor,
    Deserializer,
    IndexedObject,
    MapTypeDescriptor,
    ObjectMemberMetadata,
    Serializable,
    TypeDescriptor,
    TypedJSON,
} from '@openhps/core';
import * as protobuf from 'protobufjs';
import { AnyT, JsonObjectMetadata } from 'typedjson';

export class InternalProtobufDeserializer extends Deserializer {
    protected static primitiveWrapper: protobuf.Type;

    constructor() {
        super();

        InternalProtobufDeserializer.primitiveWrapper = new protobuf.Type('PrimitiveWrapperMessage');
        InternalProtobufDeserializer.primitiveWrapper.add(new protobuf.Field('value', 1, 'string'));

        this.setDeserializationStrategy(Number, (object: any) => {
            if (typeof object === 'number') {
                return object;
            } else if (typeof object === 'string') {
                return Number(object);
            } else if (object.toNumber) {
                return object.toNumber();
            }
            return object;
        });
        this.setDeserializationStrategy(
            Map,
            (
                object: any,
                typeDescriptor: MapTypeDescriptor,
                knownTypes: Map<string, Serializable<any>>,
                memberName: string,
                deserializer: Deserializer,
                memberOptions?: ObjectMemberMetadata,
                serializerOptions?: any,
            ) => {
                const result = new Map();
                Object.keys(object).forEach((key) => {
                    result.set(
                        key,
                        deserializer.convertSingleValue(
                            object[key],
                            typeDescriptor.valueType,
                            knownTypes,
                            memberName,
                            memberOptions,
                            serializerOptions,
                        ),
                    );
                });
                return result;
            },
        );
    }

    convertSingleValue(
        sourceObject: any,
        typeDescriptor: TypeDescriptor,
        knownTypes: Map<string, Serializable<any>>,
        memberName?: string,
        memberOptions?: ObjectMemberMetadata,
        serializerOptions?: any,
    ): any {
        if (this.retrievePreserveNull(memberOptions) && sourceObject === null) {
            return null;
        } else if (!TypedJSON.utils.isValueDefined(sourceObject)) {
            return;
        }

        const deserializer = this.deserializationStrategy.get(typeDescriptor.ctor);
        if (deserializer !== undefined) {
            return deserializer(
                sourceObject,
                typeDescriptor,
                knownTypes,
                memberName,
                this,
                memberOptions,
                serializerOptions,
            );
        }

        if (typeof sourceObject === 'object') {
            return this.convertAsObject(
                sourceObject,
                typeDescriptor,
                knownTypes,
                memberName,
                this,
                memberOptions,
                serializerOptions,
            );
        }

        let error = `Could not deserialize '${memberName}'; don't know how to deserialize type`;

        if (typeDescriptor.hasFriendlyName()) {
            error += ` '${typeDescriptor.ctor.name}'`;
        }

        this.errorHandler(new TypeError(`${error}.`));
    }

    convertAsObject<T>(
        sourceObject: IndexedObject,
        typeDescriptor: ConcreteTypeDescriptor,
        knownTypes: Map<string, Serializable<any>>,
        memberName: string,
        deserializer: InternalProtobufDeserializer,
        memberOptions?: ObjectMemberMetadata,
        serializerOptions?: any,
    ): IndexedObject | T | undefined {
        if ((typeof sourceObject as any) !== 'object' || (sourceObject as any) === null) {
            deserializer.getErrorHandler()(
                new TypeError(`Cannot deserialize ${memberName}: 'sourceObject' must be a defined object.`),
            );
            return undefined;
        }

        const expectedSelfType = typeDescriptor.ctor;
        const sourceObjectMetadata = JsonObjectMetadata.getFromConstructor(expectedSelfType);

        if (sourceObject.type_url && sourceObject.value) {
            const MessageType = serializerOptions.types.get(sourceObject.type_url) as protobuf.Type;
            const message = MessageType.decode(sourceObject.value);
            const data = this.convertAsObject(
                message,
                new ConcreteTypeDescriptor(knownTypes.get(sourceObject.type_url)),
                knownTypes,
                memberName,
                deserializer,
                memberOptions,
                serializerOptions,
            );
            return data;
        }

        const sourceMetadata = sourceObjectMetadata;
        // Strong-typed deserialization available, get to it.
        // First deserialize properties into a temporary object.
        const sourceObjectWithDeserializedProperties = {} as IndexedObject;

        // Deserialize by expected properties.
        sourceMetadata.dataMembers.forEach((objMemberMetadata, propKey) => {
            const objMemberValue = sourceObject[propKey];
            const objMemberDebugName = `${TypedJSON.utils.nameof(sourceMetadata.classType)}.${propKey}`;
            const objMemberOptions = TypedJSON.options.mergeOptions(sourceMetadata.options, objMemberMetadata.options);

            if (!sourceObject.hasOwnProperty(propKey)) {
                return;
            }

            let revivedValue;
            if (objMemberMetadata.type == null) {
                throw new TypeError(
                    `Cannot deserialize ${objMemberDebugName} there is` +
                        ` no constructor nor deserialization function to use.`,
                );
            } else if (objMemberMetadata.type() === AnyT && sourceObject[objMemberMetadata.name].type_url) {
                const MessageType = serializerOptions.types.get(
                    sourceObject[objMemberMetadata.name].type_url,
                ) as protobuf.Type;
                if (MessageType) {
                    const message = MessageType.decode(sourceObject[objMemberMetadata.name].value);
                    revivedValue = deserializer.convertSingleValue(
                        message,
                        new ConcreteTypeDescriptor(knownTypes.get(sourceObject[objMemberMetadata.name].type_url)),
                        knownTypes,
                        objMemberDebugName,
                        objMemberOptions,
                        serializerOptions,
                    );
                } else if (sourceObject[objMemberMetadata.name].value) {
                    const message = InternalProtobufDeserializer.primitiveWrapper.decode(
                        sourceObject[objMemberMetadata.name].value,
                    ) as any;
                    switch (sourceObject[objMemberMetadata.name].type_url) {
                        case 'Boolean':
                            revivedValue = Boolean(message.value);
                            break;
                        case 'Number':
                            revivedValue = Number(message.value);
                            break;
                        case 'String':
                        default:
                            revivedValue = message.value;
                    }
                }
            } else {
                revivedValue = deserializer.convertSingleValue(
                    objMemberValue,
                    objMemberMetadata.type(),
                    knownTypes,
                    objMemberDebugName,
                    objMemberOptions,
                    serializerOptions,
                );
            }

            // @todo revivedValue will never be null in RHS of ||
            if (
                TypedJSON.utils.isValueDefined(revivedValue) ||
                (deserializer.retrievePreserveNull(objMemberOptions) && (revivedValue as any) === null)
            ) {
                sourceObjectWithDeserializedProperties[objMemberMetadata.key] = revivedValue;
            } else if (objMemberMetadata.isRequired === true) {
                deserializer.getErrorHandler()(new TypeError(`Missing required member '${objMemberDebugName}'.`));
            }
        });

        // Next, instantiate target object.
        const targetObject: IndexedObject = deserializer.instantiateType(expectedSelfType);

        // Finally, assign deserialized properties to target object.
        Object.assign(targetObject, sourceObjectWithDeserializedProperties);

        // Call onDeserialized method (if any).
        const methodName = sourceObjectMetadata.onDeserializedMethodName;
        if (methodName != null) {
            if (typeof (targetObject as any)[methodName] === 'function') {
                // check for member first
                (targetObject as any)[methodName]();
            } else if (typeof (targetObject.constructor as any)[methodName] === 'function') {
                // check for static
                (targetObject.constructor as any)[methodName]();
            } else {
                deserializer.getErrorHandler()(
                    new TypeError(
                        `onDeserialized callback` +
                            `'${TypedJSON.utils.nameof(
                                sourceObjectMetadata.classType,
                            )}.${methodName}' is not a method.`,
                    ),
                );
            }
        }
        return targetObject;
    }
}
