import { Constructor, DataSerializer, DataSerializerConfig, DataSerializerUtils } from '@openhps/core';
import * as path from 'path';
import * as protobuf from 'protobufjs';
import * as fs from 'fs';
import { ProjectGenerator } from './generator';
import { InternalProtobufDeserializer } from './InternalProtobufDeserializer';
import { InternalProtobufSerializer } from './InternalProtobufSerializer';

export class ProtobufSerializer extends DataSerializer {
    protected static wrapperMessage: protobuf.Type;
    protected static options: ProtobufSerializerConfig = {
        serializer: new InternalProtobufSerializer(),
        deserializer: new InternalProtobufDeserializer(),
        types: new Map(),
    };

    private static getFiles(directory: string, files: string[] = []): string[] {
        if (!fs.statSync(directory).isDirectory()) {
            return [];
        }
        const fileList = fs.readdirSync(path.normalize(directory));
        for (const file of fileList) {
            const name = `${directory}/${file}`;
            if (fs.statSync(name).isDirectory()) {
                this.getFiles(name, files);
            } else if (name.endsWith('.proto')) {
                files.push(path.normalize(name));
            }
        }
        return files;
    }

    /**
     * Initialize the protocol buffer serializer
     * @param {string} [directory] Directory of generated protocol messages. Default will generate on the fly
     * @returns {Promise<void>} Promise once initialized
     */
    static initialize(directory?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            Promise.resolve(
                !directory ? (ProjectGenerator.buildProject(path.resolve('tmp')) as any) : Promise.resolve(),
            )
                .then(() => {
                    const promises: Array<PromiseLike<void>> = [];
                    const files = this.getFiles(path.resolve(directory ?? 'tmp'));
                    for (const file of files) {
                        promises.push(
                            new Promise((resolveMessage) => {
                                protobuf.load(file, (err: Error, root) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    const className = path.parse(file).name;
                                    this.options.types.set(className, root.lookupType(className));
                                    resolveMessage();
                                });
                            }),
                        );
                    }

                    this.wrapperMessage = new protobuf.Type('WrapperMessage');
                    this.wrapperMessage.add(new protobuf.Field('data', 1, 'google.protobuf.Any'));
                    this.wrapperMessage.addJSON(protobuf.common['google/protobuf/any.proto'].nested);
                    return Promise.all(promises);
                })
                .then(() => resolve())
                .catch(reject);
        });
    }

    /**
     * Serialize data
     * @param {any} data Data to serialize
     * @param {DataSerializerConfig} [config] Data serializer configuration
     * @returns {Uint8Array} Serialized buffer
     */
    static serialize<T>(data: T, config?: DataSerializerConfig): Uint8Array {
        const serializedData = super.serialize(data, {
            ...this.options,
            ...config,
        });
        const MessageType = this.options.types.get(data.constructor.name) as protobuf.Type;
        const message = MessageType.fromObject(serializedData);
        const wrapper = this.wrapperMessage.create({
            data: {
                type_url: data.constructor.name,
                value: MessageType.encode(message).finish(),
            },
        });
        return this.wrapperMessage.encode(wrapper).finish();
    }

    /**
     * Deserialize data
     * @param serializedData Data to deserialze
     * @param dataType Optional data type to specify deserialization type
     * @param config Data serializer configuration
     */
    static deserialize<T>(
        serializedData: Uint8Array | any,
        dataType?: Constructor<T>,
        config?: DataSerializerConfig,
    ): T {
        const decodedData: any = this.wrapperMessage.decode(serializedData);
        const typeURL = decodedData.data.type_url;
        const MessageType = this.options.types.get(typeURL) as protobuf.Type;
        const decodedMessage = MessageType.decode(decodedData.data.value);

        const finalType = dataType ?? (this.knownTypes.get(typeURL) as Constructor<T>);
        return this.options.deserializer.convertSingleValue(
            decodedMessage,
            DataSerializerUtils.ensureTypeDescriptor(finalType),
            DataSerializer.knownTypes,
            undefined,
            undefined,
            {
                ...config,
                ...this.options
            },
        );
    }
}

export interface ProtobufSerializerConfig extends DataSerializerConfig {
    types: Map<string, protobuf.Type>;
}
