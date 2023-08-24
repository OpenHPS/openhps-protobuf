import {
    ArrayTypeDescriptor,
    DataSerializerUtils,
    MapTypeDescriptor,
    NumberType,
    ObjectMemberMetadata,
    ObjectMetadata,
    SerializableMemberOptions,
    TypeDescriptor,
    SerializationUtils,
    ConcreteTypeDescriptor,
} from '@openhps/core';
import chalk from 'chalk';
import { AnyT } from 'typedjson';
import { HEADER } from './constants';

/**
 * Protobuf object generator
 */
export class ObjectGenerator {
    protected static numberTypeMapping(numberType: NumberType): string {
        switch (numberType) {
            case NumberType.DECIMAL:
            case NumberType.DOUBLE:
            case NumberType.FLOAT:
                return 'double';
            case NumberType.LONG:
                return 'int64';
            case NumberType.INTEGER:
            case NumberType.SHORT:
                return 'int32';
            default:
                return 'string';
        }
    }

    protected static typeMapping(
        object: ObjectMetadata,
        type: TypeDescriptor,
        memberOptions: ObjectMemberMetadata,
        logLevel: number,
    ): TypeMapping {
        switch (type.ctor) {
            case String:
                return {
                    syntax: 'string',
                };
            case Number: {
                const options: SerializableMemberOptions = memberOptions.options;
                const numberType = options ? this.numberTypeMapping(options.numberType) : 'int32';
                if (numberType === 'string' && logLevel > 1) {
                    console.warn(
                        chalk.yellow(
                            `${object.classType.name}[${memberOptions.name}] defines a number without specifing a type. This will affect performance.`,
                        ),
                    );
                }
                return {
                    syntax: numberType,
                };
            }
            case Boolean:
                return {
                    syntax: 'bool',
                };
            case Array: {
                const mappings = this.typeMapping(
                    object,
                    (type as ArrayTypeDescriptor).elementType,
                    memberOptions,
                    logLevel,
                );
                return {
                    syntax: `repeated ${mappings.syntax}`,
                    types: [mappings],
                };
            }
            case Map: {
                const key = this.typeMapping(object, (type as MapTypeDescriptor).keyType, memberOptions, logLevel);
                const value = this.typeMapping(object, (type as MapTypeDescriptor).valueType, memberOptions, logLevel);
                if (key === undefined || value === undefined) {
                    return undefined;
                }
                return {
                    syntax: `map<${key.syntax},${value.syntax}>`,
                    types: [value, key],
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
                    syntax: 'types',
                };
            default: {
                if (type.ctor.name !== '') {
                    const memberMetadata = DataSerializerUtils.getOwnMetadata(type.ctor);
                    if (!memberMetadata) {
                        return {
                            syntax: 'google.protobuf.Any',
                        };
                    } else if (
                        memberMetadata.knownTypes.size > 1 &&
                        memberMetadata.protobuf.type &&
                        memberMetadata.protobuf.type !== object.classType
                    ) {
                        return this.typeMapping(
                            DataSerializerUtils.getOwnMetadata(memberMetadata.protobuf.type),
                            type,
                            memberOptions,
                            logLevel,
                        );
                    } else if (memberMetadata.knownTypes.size > 1  && !memberMetadata.protobuf.type) {
                        return {
                            syntax: 'google.protobuf.Any',
                        };
                    } else {
                        const packageStr = type.ctor.prototype._module ? type.ctor.prototype._module : '@openhps/core';
                        return {
                            syntax: type.ctor.name,
                            package: packageStr,
                        };
                    }
                }
            }
        }
        return undefined;
    }

    static processObject(object: ObjectMetadata): void {
        object.protobuf = object.protobuf ?? {};

        const dataMembers = object.dataMembers;
        // Parse object itself
        if (object.knownTypes.size > 1) {
            const subTypes = [];
            const modules = new Set<string>();
            let allowOverride: boolean = true;
            const dataMembersClone = SerializationUtils.cloneDeep(dataMembers);
            object.knownTypes.forEach((knownType) => {
                const knownTypeMeta = DataSerializerUtils.getOwnMetadata(knownType);
                const knownTypeDataMembers = knownTypeMeta.dataMembers;
                modules.add(knownType.prototype._module);

                if (knownType !== object.classType && knownType.prototype instanceof object.classType) {
                    subTypes.push(knownType);
                }

                knownTypeDataMembers.forEach((member, key) => {
                    member.options = member.options ?? {};
                    member.options.protobuf = member.options.protobuf ?? {};

                    if (!dataMembers.has(key)) {
                        const memberClone = SerializationUtils.cloneDeep(member);
                        // Optional
                        memberClone.options.protobuf = {
                            optional: true,
                        };
                        dataMembersClone.set(key, memberClone);
                    } else if (dataMembers.get(key).type().ctor !== member.type().ctor) {
                        allowOverride = false;
                    }
                });
            });

            object.protobuf.subTypes = subTypes;
            object.protobuf.subModules = modules;
            if (subTypes.length > 0 && modules.size === 1 && allowOverride) {
                object.dataMembers = dataMembersClone;
                object.protobuf.type = object.protobuf.type ?? object.classType;
                subTypes.forEach((type) => {
                    const subTypeMeta = DataSerializerUtils.getOwnMetadata(type);
                    subTypeMeta.protobuf = subTypeMeta.protobuf ?? {};
                    subTypeMeta.protobuf.type = object.classType;
                });
            }
        }
    }

    static createProtoMessage(object: ObjectMetadata, logLevel: number): [string, string] {
        const dataMembers = object.dataMembers;
        const packageStr = object.classType.prototype._module ? object.classType.prototype._module : '@openhps/core';
        const imports = [];

        // Parse object itself
        let dataTypesEnum = undefined;
        if (object.knownTypes.size > 1) {
            if (object.protobuf.subTypes.length > 0 && object.protobuf.subModules.size === 1) {
                imports.push(`import "../../common.proto";`);
                dataTypesEnum =
                    `\n\nenum ${object.classType.name}Type {\n` +
                    object.protobuf.subTypes
                        .map((type, i) => {
                            return `\t${type.name
                                .replace(/(?:^|\.?)(([A-Z0-9][a-z0-9]|$)|([0-9]+[A-Z]))/g, (_, y) => {
                                    return '_' + y;
                                })
                                .replace(/(^_)|(_$)/g, '')
                                .toUpperCase()} = ${i} [(className) = "${type.name}", (packageName) = "${type.prototype._module}"]`;
                        })
                        .join(';\n') +
                    `;\n}\n`;
            }
        }

        let index = 10;
        const members = Array.from(dataMembers.values())
            .map((member) => {
                const options: any =
                    member.options && (member.options as any).protobuf ? (member.options as any).protobuf : {};
                let type: TypeMapping = undefined;
                if (member.type() === AnyT) {
                    type = {
                        syntax: 'google.protobuf.Any',
                    };
                } else if (member.serializer && member.type === undefined) {
                    // Custom serializer
                    return undefined;
                } else {
                    type = this.typeMapping(object, member.type(), member, logLevel);
                }

                if (!type) {
                    return undefined;
                }

                if (type.package && type.package === packageStr) {
                    imports.push(`import "${type.syntax}.proto";`);
                } else if (type.package) {
                    imports.push(`import "../../${type.package}/${type.syntax}.proto";`);
                } else if (type.syntax === 'google.protobuf.Any') {
                    imports.push(`import "google/protobuf/any.proto";`);
                }

                if (type.types) {
                    type.types.forEach((dependency) => {
                        if (dependency.package && dependency.package === packageStr) {
                            imports.push(`import "${dependency.syntax}.proto";`);
                        } else if (dependency.package) {
                            imports.push(`import "../../${dependency.package}/${dependency.syntax}.proto";`);
                        } else if (dependency.syntax === 'google.protobuf.Any') {
                            imports.push(`import "google/protobuf/any.proto";`);
                        }
                    });
                }

                return `\t${options.optional && !type.syntax.includes('<') ? 'optional ' : ''}${type.syntax} ${
                    member.name
                } = ${index++};`;
            })
            .filter((value) => value !== undefined);

        return [
            packageStr,
            HEADER +
                `package ${packageStr.replace('@', '').replace('/', '.')};\n` +
                `syntax = "proto3";\n` +
                imports
                    .filter((value, idx) => {
                        return imports.indexOf(value) === idx;
                    })
                    .join('\n') +
                (dataTypesEnum ? dataTypesEnum : '') +
                `\nmessage ${object.classType.name} {\n` +
                (dataTypesEnum ? `\t${object.classType.name}Type _type = 0;\n` : '') +
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
