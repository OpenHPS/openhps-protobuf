import {
    ConcreteTypeDescriptor,
    DataSerializer,
    DataSerializerUtils,
    Deserializer,
    IndexedObject,
    MapTypeDescriptor,
    ObjectMemberMetadata,
    ObjectMetadata,
    Serializable,
} from '@openhps/core';
import * as protobuf from 'protobufjs';
import { AnyT } from 'typedjson';

export class InternalProtobufDeserializer extends Deserializer {
    protected static primitiveWrapper: protobuf.Type;

    constructor() {
        super();

        InternalProtobufDeserializer.primitiveWrapper = new protobuf.Type('PrimitiveWrapperMessage');
        InternalProtobufDeserializer.primitiveWrapper.add(new protobuf.Field('value', 1, 'string'));

        this.setDeserializationStrategy(
            Number,
            (object: any) => {
                if (typeof object === 'number') {
                    return object;
                } else if (typeof object === 'string') {
                    return Number(object);
                } else if (object.toNumber) {
                    return object.toNumber();
                }
                return object;
            }
        );
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
                        deserializer.convertAsObject(
                            object[key],
                            typeDescriptor.valueType,
                            knownTypes,
                            memberName,
                            deserializer,
                            memberOptions,
                            serializerOptions,
                        ),
                    );
                });
                return result;
            },
        );
    }

    private _convertMembers(
        sourceObject: IndexedObject,
        memberMetadata: ObjectMetadata,
        serializerOptions?: any): any {
        memberMetadata.dataMembers.forEach(member => {
            if (member.type() === AnyT) {
                const MessageType = serializerOptions.types.get(sourceObject[member.name].type_url) as protobuf.Type;
                if (MessageType) {
                    const message = MessageType.decode(sourceObject[member.name].value);
                    sourceObject[member.name] = {
                        ...message,
                        __type: sourceObject[member.name].type_url
                    };
                } else {
                    const message = InternalProtobufDeserializer.primitiveWrapper.decode(sourceObject[member.name].value) as any;
                    switch(sourceObject[member.name].type_url) {
                        case "Boolean":
                            sourceObject[member.name] = Boolean(message.value);
                        case "Number":
                            sourceObject[member.name] = Number(message.value);
                        case "String":
                        default:
                            sourceObject[member.name] = message.value;
                    }
                }
            }
        });
        return sourceObject;
    }

    convertAsObject<T>(
        sourceObject: IndexedObject,
        typeDescriptor: ConcreteTypeDescriptor,
        knownTypes: Map<string, Serializable<any>>,
        memberName: string,
        deserializer: Deserializer,
        memberOptions?: ObjectMemberMetadata,
        serializerOptions?: any,
    ): IndexedObject | T {
        if (sourceObject.type_url && sourceObject.value) {
            const MessageType = serializerOptions.types.get(sourceObject.type_url) as protobuf.Type;
            const message = MessageType.decode(sourceObject.value);
            const memberMetadata = DataSerializerUtils.getOwnMetadata(typeDescriptor.ctor);
            this._convertMembers(message, memberMetadata, serializerOptions);
            const data = super.convertAsObject.bind(this)(
                {
                    ...message,
                    __type: sourceObject.type_url
                },
                new ConcreteTypeDescriptor(knownTypes.get(sourceObject.type_url)),
                knownTypes,
                memberName,
                deserializer,
                memberOptions,
                serializerOptions,
            );
            return data;
        } else {
            return super.convertAsObject.bind(this)(
                sourceObject,
                typeDescriptor,
                knownTypes,
                memberName,
                deserializer,
                memberOptions,
                serializerOptions,
            );
        }
    }
}
