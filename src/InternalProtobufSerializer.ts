import {
    ConcreteTypeDescriptor,
    DataSerializerUtils,
    IndexedObject,
    MapTypeDescriptor,
    ObjectMemberMetadata,
    ObjectMetadata,
    Serializer,
} from '@openhps/core';
import { Type } from 'protobufjs';
import { AnyT } from 'typedjson';
import * as protobuf from 'protobufjs';

export class InternalProtobufSerializer extends Serializer {
    protected static primitiveWrapper: Type;

    constructor() {
        super();

        InternalProtobufSerializer.primitiveWrapper = new protobuf.Type('PrimitiveWrapperMessage');
        InternalProtobufSerializer.primitiveWrapper.add(new protobuf.Field('value', 1, 'string'));

        this.setSerializationStrategy(
            Map,
            (
                object: Map<any, any>,
                typeDescriptor: MapTypeDescriptor,
                memberName: string,
                serializer: Serializer,
                memberOptions?: ObjectMemberMetadata,
                serializerOptions?: any,
            ) => {
                const result = {};
                object.forEach((value, key) => {
                    result[key] = this.convertAsObject(
                        value,
                        typeDescriptor.valueType,
                        memberName,
                        serializer,
                        memberOptions,
                        serializerOptions,
                    );
                });
                return result;
            },
        );
    }

    private _convertMembers(source: any, data: any, memberMetadata: ObjectMetadata, types: Map<string, protobuf.Type>): any {
        memberMetadata.dataMembers.forEach(member => {
            if (member.type() === AnyT && data.type_url === undefined) {
                const MessageType = types.get(source[member.name].constructor.name) as protobuf.Type;
                if (MessageType) {
                    const message = MessageType.fromObject(data[member.name]);
                    data[member.name] = {
                        type_url: source[member.key].constructor.name,
                        value: MessageType.encode(message).finish()
                    };
                } else {
                    const message = InternalProtobufSerializer.primitiveWrapper.fromObject({
                        value: data[member.name]
                    });
                    data[member.name] = {
                        type_url: source[member.key].constructor.name,
                        value: InternalProtobufSerializer.primitiveWrapper.encode(message).finish()
                    };
                }
            }
        });
        return data;
    }

    convertAsObject(
        sourceObject: IndexedObject,
        typeDescriptor: ConcreteTypeDescriptor,
        memberName: string,
        serializer: Serializer,
        memberOptions?: ObjectMemberMetadata,
        serializerOptions?: any,
    ): IndexedObject {
        const memberMetadata = DataSerializerUtils.getOwnMetadata(typeDescriptor.ctor);
        if (memberMetadata && memberMetadata.knownTypes.size > 1 && memberName) {
            const data = super.convertAsObject.bind(this)(
                sourceObject,
                typeDescriptor,
                memberName,
                serializer,
                memberOptions,
                serializerOptions,
            );
            this._convertMembers(sourceObject, data, memberMetadata, serializerOptions.types);
            const MessageType = serializerOptions.types.get(sourceObject.constructor.name) as protobuf.Type;
            const message = MessageType.fromObject(data);
            return {
                type_url: sourceObject.constructor.name,
                value: MessageType.encode(message).finish(),
            };
        } else {
            return super.convertAsObject.bind(this)(
                sourceObject,
                typeDescriptor,
                memberName,
                serializer,
                memberOptions,
                serializerOptions,
            );
        }
    }
}
