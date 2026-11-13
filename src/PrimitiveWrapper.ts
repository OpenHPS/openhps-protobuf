import * as protobuf from 'protobufjs';

/**
 * Protobuf type wrapping a primitive value as a string.
 * Shared by the serializer and the deserializer as the `google.protobuf.Any`
 * fallback for primitive values that protobuf cannot express directly.
 */
export const primitiveWrapper: protobuf.Type = new protobuf.Type('PrimitiveWrapperMessage');
primitiveWrapper.add(new protobuf.Field('value', 1, 'string'));
