import {
    ArrayTypeDescriptor,
    DataSerializerUtils,
    MapTypeDescriptor,
    ObjectMemberMetadata,
    ObjectMetadata,
    SerializableMemberOptions,
    TypeDescriptor,
    SerializationUtils,
    ConcreteTypeDescriptor,
} from '@openhps/core';
import chalk from 'chalk';
import { AnyT, Constructor } from 'typedjson';
import { HEADER } from './constants';
import { ProtobufGenerator, ProtobufMessage } from './ProtobufGenerator';
import { ProjectBuildOptions } from './types';

/**
 * Protobuf object generator
 */
export class ObjectGenerator extends ProtobufGenerator<Object> { // eslint-disable-line
    processObject(object: Constructor<Object>, metaData: ObjectMemberMetadata): Promise<void> { // eslint-disable-line
        throw new Error('Method not implemented.');
    }

    generate(object: Constructor<Object>, metaData: ObjectMemberMetadata): Promise<ProtobufMessage> { // eslint-disable-line
        throw new Error('Method not implemented.');
    }

    protected static typeMapping(
        object: ObjectMetadata,
        type: TypeDescriptor,
        memberOptions: ObjectMemberMetadata,
        buildOptions: ProjectBuildOptions,
    ): TypeMapping {
        switch (type.ctor) {
            case String:
                return {
                    syntax: 'string',
                };
            case Number: {
                const options: SerializableMemberOptions = memberOptions.options;
                const numberType = options ? this.getNumberType(options.numberType) : 'int32';
                if (numberType === 'string' && buildOptions.logLevel > 1) {
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
                    buildOptions,
                );
                return {
                    syntax: `repeated ${mappings.syntax}`,
                    types: [mappings],
                };
            }
            case Map: {
                const key = this.typeMapping(object, (type as MapTypeDescriptor).keyType, memberOptions, buildOptions);
                const value = this.typeMapping(
                    object,
                    (type as MapTypeDescriptor).valueType,
                    memberOptions,
                    buildOptions,
                );
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
                    syntax: 'bytes',
                };
            default: {
                const memberMetadata = DataSerializerUtils.getOwnMetadata(type.ctor);
                if (!memberMetadata) {
                    return {
                        syntax: 'google.protobuf.Any',
                    };
                } else if (
                    memberMetadata.knownTypes.size > 1 &&
                    memberMetadata.protobuf.generator.type &&
                    memberMetadata.protobuf.generator.type !== object.classType
                ) {
                    return this.typeMapping(
                        DataSerializerUtils.getOwnMetadata(memberMetadata.protobuf.generator.type),
                        type,
                        memberOptions,
                        buildOptions,
                    );
                } else if (
                    memberMetadata.knownTypes.size > 1 &&
                    !memberMetadata.protobuf.generator.type &&
                    memberOptions &&
                    (buildOptions.useAnyType || !memberMetadata.protobuf.generator.allowOverride)
                ) {
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

    static processObject(object: ObjectMetadata, buildOptions: ProjectBuildOptions): void {
        object.protobuf = object.protobuf ?? {
            generator: {
                subModules: new Set(),
                subTypes: [],
                allowOverride: true,
            },
        };

        const dataMembers = object.dataMembers;
        // Parse object itself
        if (object.knownTypes.size > 1) {
            const subTypes = [];
            const modules = new Set<string>();
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
                            subMembers: new Map(),
                        };
                        dataMembersClone.set(key, memberClone);
                    } else if (dataMembers.get(key).type().ctor !== member.type().ctor) {
                        const memberClone = dataMembersClone.get(member.key);
                        object.protobuf.generator.allowOverride = false;
                        memberClone.options = memberClone.options ?? {};
                        memberClone.options.protobuf = memberClone.options.protobuf ?? { subMembers: new Map() };
                        const subMembers = (memberClone.options.protobuf as any).subMembers ?? new Map();
                        const memberName = member.name + '_' + member.type().ctor.name.toLowerCase();
                        subMembers.set(memberName, member);
                        member.options = member.options ?? {};
                        member.options.protobuf = member.options.protobuf ?? {};
                        member.options.protobuf.name = memberName;
                    }
                });
            });

            object.protobuf.generator.subTypes = subTypes;
            object.protobuf.generator.subModules = modules;
            if (subTypes.length > 0 && (modules.size === 1 || !buildOptions.useAnyType)) {
                object.protobuf.generator.dataMembers = dataMembersClone;
                object.protobuf.generator.type = object.protobuf.generator.type ?? object.classType;
                subTypes.forEach((type) => {
                    const subTypeMeta = DataSerializerUtils.getOwnMetadata(type);
                    subTypeMeta.protobuf = subTypeMeta.protobuf ?? { generator: {} };
                    subTypeMeta.protobuf.generator.type = object.classType;
                });
            }
        }
    }

    static createProtoMessage(object: ObjectMetadata, buildOptions: ProjectBuildOptions): [string, string] {
        const rootMeta = DataSerializerUtils.getRootMetadata(object.classType);
        const dataMembers = object.protobuf.generator.dataMembers ?? object.dataMembers;
        const packageStr = object.classType.prototype._module ? object.classType.prototype._module : '@openhps/core';
        const imports = [];

        // Parse object itself
        let dataTypesEnum = undefined;

        if (object.knownTypes.size > 1) {
            if (
                object.protobuf.generator.subTypes.length > 0 &&
                (object.protobuf.generator.subModules.size === 1 || !buildOptions.useAnyType)
            ) {
                imports.push(`import "../../common.proto";`);
                dataTypesEnum =
                    `\nenum ${object.classType.name}Type {\n` +
                    `\tUNSPECIFIED = 0;\n` +
                    [object.classType, ...object.protobuf.generator.subTypes]
                        .map((type) => {
                            return `\t${type.name
                                .replace(/(?:^|\.?)(([A-Z0-9][a-z0-9]|$)|([0-9]+[A-Z]))/g, (_, y) => {
                                    return '_' + y;
                                })
                                .replace(/(^_)|(_$)/g, '')
                                .toUpperCase()} = ${
                                Array.from(rootMeta.knownTypes.values()).indexOf(type) + 1
                            } [\n\t\t(className) = "${type.name}",\n\t\t(packageName) = "${type.prototype._module}"\n\t]`;
                        })
                        .join(';\n') +
                    `;\n}\n`;
            }
        }

        if (rootMeta.classType !== object.classType) {
            const rootMetaType = this.typeMapping(
                rootMeta,
                new ConcreteTypeDescriptor(rootMeta.classType),
                undefined,
                buildOptions,
            );
            if (rootMetaType.package && rootMetaType.package === packageStr) {
                imports.push(`import "${rootMetaType.syntax}.proto";`);
            } else if (rootMetaType.package) {
                imports.push(`import "../../${rootMetaType.package}/${rootMetaType.syntax}.proto";`);
            }
        }

        let index = 1;
        const members = Array.from(dataMembers.values())
            .map((member) => {
                const options: any =
                    member.options && (member.options as any).protobuf ? (member.options as any).protobuf : {};
                let type: TypeMapping = undefined;
                const memberName = options.name ?? member.name;

                if (memberName === 'uid') {
                    // Handle as UUID or string
                    type = {
                        syntax: 'oneof',
                        types: [
                            {
                                syntax: 'string',
                                name: 'uid_string',
                            },
                            {
                                syntax: 'bytes',
                                name: 'uid_bytes',
                            },
                        ],
                    };
                } else if (member.type() === AnyT) {
                    if (options.subMembers && options.subMembers.size > 0) {
                        type = {
                            syntax: 'oneof',
                            types: [
                                ...Array.from(options.subMembers.keys()).map((key: string) => {
                                    const subMember = options.subMembers.get(key);
                                    const typeMapping = this.typeMapping(
                                        object,
                                        subMember.type(),
                                        subMember,
                                        buildOptions,
                                    );
                                    typeMapping.name = key;
                                    return typeMapping;
                                }),
                                {
                                    syntax: 'google.protobuf.Any',
                                    name: memberName + '_' + 'any',
                                },
                            ],
                        };
                    } else {
                        type = {
                            syntax: 'google.protobuf.Any',
                        };
                    }
                } else if (member.serializer && member.type === undefined) {
                    // Custom serializer
                    return undefined;
                } else {
                    type = this.typeMapping(object, member.type(), member, buildOptions);
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

                if (type.syntax === 'oneof') {
                    return (
                        `\toneof ${memberName} {\n` +
                        type.types
                            .map((subType) => {
                                return `\t\t${subType.syntax} ${subType.name} = ${index++}`;
                            })
                            .join(';\n') +
                        `;\n\t}`
                    );
                } else {
                    return `\t${
                        options.optional && !(type.syntax.includes('<') || type.syntax.includes('repeated'))
                            ? 'optional '
                            : ''
                    }${type.syntax} ${memberName} = ${index++};`;
                }
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
                `\n` +
                (dataTypesEnum ? dataTypesEnum : '') +
                `\nmessage ${object.classType.name} {\n` +
                (rootMeta.protobuf.generator.type
                    ? `\t${rootMeta.protobuf.generator.type.name}Type _type = 0;\n`
                    : '') +
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
    name?: string;
}
