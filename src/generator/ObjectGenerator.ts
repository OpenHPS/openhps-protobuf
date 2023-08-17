import {
    ArrayTypeDescriptor,
    DataSerializerUtils,
    MapTypeDescriptor,
    NumberType,
    ObjectMemberMetadata,
    ObjectMetadata,
    SerializableMemberOptions,
    TypeDescriptor,
} from '@openhps/core';
import { AnyT } from 'typedjson';

/**
 * Protobuf object generator
 */
export class ObjectGenerator {
    protected static numberTypeMapping(numberType: NumberType): string {
        switch (numberType) {
            case NumberType.DECIMAL:
            case NumberType.DOUBLE:
            case NumberType.FLOAT:
                return "double";
            case NumberType.LONG:
                return "int64";
            case NumberType.INTEGER:
            case NumberType.SHORT:
            default:
                return "string";
        }
    }

    protected static typeMapping(type: TypeDescriptor, memberOptions: ObjectMemberMetadata): TypeMapping {
        switch (type.ctor) {
            case String:
                return {
                    syntax: 'string'
                };
            case Number:
                const options: SerializableMemberOptions = memberOptions.options;
                return {
                    syntax: options ? this.numberTypeMapping(options.numberType) : 'int32'
                };
            case Boolean:
                return {
                    syntax: 'bool'
                };
            case Array: {
                const mappings = this.typeMapping((type as ArrayTypeDescriptor).elementType, memberOptions);
                return {
                    syntax: `repeated ${mappings.syntax}`,
                    types: [mappings]
                };
            }
            case Map: {
                const key = this.typeMapping((type as MapTypeDescriptor).keyType, memberOptions);
                const value = this.typeMapping((type as MapTypeDescriptor).valueType, memberOptions);
                if (key === undefined || value === undefined) {
                    return undefined;
                }
                return {
                    syntax: `map<${key.syntax},${value.syntax}>`,
                    types: [value, key]
                };
            }
            case Set:
            case Object:
            case Function:
                // Non-serializable types
                return undefined;
            case Buffer:
            case Uint8Array:
                return {
                    syntax: "types",
                };
            default: {
                if (type.ctor.name !== '') {
                    const memberMetadata = DataSerializerUtils.getOwnMetadata(type.ctor);
                    if (memberMetadata && memberMetadata.knownTypes.size > 1) {
                        return {
                            syntax: "google.protobuf.Any",
                        };
                    } else {
                        const packageStr =
                            type.ctor.prototype._module
                                ? type.ctor.prototype._module
                                : '@openhps/core';
                        return {
                            syntax: type.ctor.name,
                            package: packageStr
                        };
                    }
                }
            }
        }
        return undefined;
    }

    static createProtoMessage(object: ObjectMetadata): [string, string] {
        const dataMembers = Array.from(object.dataMembers.values());
        const packageStr =
            object.classType.prototype._module
                ? object.classType.prototype._module
                : '@openhps/core';

        const imports = [];
        const members = dataMembers
            .map((member, index) => {
                let type: TypeMapping = undefined;
                if (member.type() === AnyT) {
                    type = {
                        syntax: "google.protobuf.Any"
                    };
                } else if (member.serializer) {
                    // Custom serializer
                    return undefined;
                } else {
                    type = this.typeMapping(member.type(), member);
                }

                if (!type) {
                    return undefined;
                }

                if (type.package && type.package === packageStr) {
                    imports.push(`import "${type.syntax}.proto";`);
                } else if (type.package) {
                    imports.push(`import "../${type.package}/${type.syntax}.proto";`);
                } else if (type.syntax === 'google.protobuf.Any') {
                    imports.push(`import "google/protobuf/any.proto";`);
                }

                if (type.types) {
                    type.types.forEach(dependency => {
                        if (dependency.package && dependency.package === packageStr) {
                            imports.push(`import "${dependency.syntax}.proto";`);
                        } else if (dependency.package) {
                            imports.push(`import "../${dependency.package}/${dependency.syntax}.proto";`);
                        } else if (dependency.syntax === 'google.protobuf.Any') {
                            imports.push(`import "google/protobuf/any.proto";`);
                        }
                    });
                }
                return `\t${type.syntax} ${member.name} = ${index + 1};`;
            })
            .filter((value) => value !== undefined);

        return [
            packageStr,
            `package ${packageStr.replace("@","").replace("/", ".")};\n` +
                `syntax = "proto3";\n` +
                imports
                    .filter((value, idx) => {
                        return imports.indexOf(value) === idx;
                    })
                    .join('\n') +
                `\nmessage ${object.classType.name} {\n` +
                members.join('\n') +
                `\n` +
                `}\n`,
        ];
    }
}

export type ProtobufPrimitive = 'string' | 'int32' | 'bool' | 'bytes';
export interface TypeMapping {
    syntax: ProtobufPrimitive | string;
    types?: TypeMapping[];
    package?: string;
}
