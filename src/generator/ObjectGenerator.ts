import {
    ArrayTypeDescriptor,
    MapTypeDescriptor,
    ObjectMetadata,
    TypeDescriptor,
} from '@openhps/core';

/**
 * Protobuf object generator
 */
export class ObjectGenerator {
    protected static typeMapping(type: TypeDescriptor): [string, string[]] {
        switch (type.ctor) {
            case String:
                return ['string', undefined];
            case Number:
                return ['int32', undefined];
            case Boolean:
                return ['bool', undefined];
            case Array:
                const mapping = this.typeMapping((type as ArrayTypeDescriptor).elementType);
                return [`repeated ${mapping[0]}`, mapping[1]];
            case Map:
                const key = this.typeMapping((type as MapTypeDescriptor).keyType);
                const value = this.typeMapping((type as MapTypeDescriptor).valueType);
                if (key === undefined || value === undefined) {
                    return undefined;
                }
                return [`map<${key[0]},${value[0]}>`, value[1]];
            case Set:
            case Object:
            case Function:
                // Non-serializable types
                return undefined;
            case Buffer: 
            case Uint8Array:
                return ["bytes", undefined];
            default:
                if (type.ctor.name !== '') {
                    const packageStr = (type.ctor.prototype._module && type.ctor.prototype._module.startsWith('@openhps/')
                            ? type.ctor.prototype._module.split('/')[1]
                            : 'core');
                    return [type.ctor.name, [type.ctor.name, packageStr]];
                }
        }
        return undefined;
    }

    static createProtoMessage(object: ObjectMetadata): [string, string] {
        // Get super class
        const dataMembers = Array.from(object.dataMembers.values());
        const packageStr =
            (object.classType.prototype._module && object.classType.prototype._module.startsWith('@openhps/')
                ? object.classType.prototype._module.split('/')[1]
                : 'core');

        const imports = [];
        const members = dataMembers
            .map((member, index) => {
                let type: [string, string[]] = undefined;
                if (member.serializer) {
                    // Custom serializer
                    return undefined;
                } else {
                    type = this.typeMapping(member.type());
                }

                if (!type) {
                    return undefined;
                }

                if (type[1] && type[1][1] === packageStr) {
                    imports.push(`import "${type[1][0]}.proto";`);
                } else if (type[1]) {
                    imports.push(`import "../${type[1][1]}/${type[1][0]}.proto";`);
                }
                return (`\t${type[0]} ${member.name} = ${index + 1};`);
            })
            .filter((value) => value !== undefined);

        return [packageStr, (
            `package ${packageStr};\n` +
            `syntax = "proto3";\n` +
            imports.filter((value, idx) => {
                return imports.indexOf(value) === idx
            }).join('\n') +
            `\nmessage ${object.classType.name} {\n` +
            members.join('\n') +
            `\n` +
            `}\n`
        )];
    }
}
