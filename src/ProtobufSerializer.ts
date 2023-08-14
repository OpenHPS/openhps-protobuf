import { Constructor, DataSerializer, DataSerializerConfig, Deserializer, Serializer } from "@openhps/core";
import * as path from "path";
import * as protobuf from 'protobufjs';
import * as fs from 'fs';

export class ProtobufSerializer extends DataSerializer {
    protected static types: Map<string, protobuf.Type> = new Map();  
    protected static wrapperMessage: protobuf.Type;
    protected static options: DataSerializerConfig  = {
        serializer: new Serializer(),
        deserializer: new Deserializer(),
    }

    static {
        this.options.serializer.setSerializationStrategy(Map, ((object: Map<any, any>) => {
            const result = {};
            object.forEach((value, key) => {
                result[key] = value;
            });
            return result;
        }));
        this.options.deserializer.setDeserializationStrategy(Map, ((object: any) => {
            const result = new Map();
            Object.keys(object).forEach(key => {
                result.set(key, object[key]);
            });
            return result;
        }));
    }

    private static getFiles(directory: string, files: string[] = []): string[] {
        if (!fs.statSync(directory).isDirectory()) {
            return [];
        }
        const fileList = fs.readdirSync(path.normalize(directory));
        for (const file of fileList) {
            const name = `${directory}/${file}`;
            if (fs.statSync(name).isDirectory()) {
                this.getFiles(name, files);
            } else if (name.endsWith(".proto")) {
                files.push(path.normalize(name));
            }
        }
        return files;
    } 

    static initialize(directory: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const promises: Array<PromiseLike<void>> = [];
            const files = this.getFiles(directory);
            for (const file of files) {
                promises.push(new Promise((resolveMessage) => {
                    protobuf.load(file, (err: Error, root) => {
                        if (err) {
                            return reject(err);
                        }
                        const className = path.parse(file).name;
                        this.types.set(className, root.lookupType(className));
                        resolveMessage();
                    });
                }));
            }

            this.wrapperMessage = new protobuf.Type("WrapperMessage");
            this.wrapperMessage.add(new protobuf.Field("data", 1, "google.protobuf.Any"));
            this.wrapperMessage.addJSON(protobuf.common["google/protobuf/any.proto"].nested);

            Promise.all(promises).then(() => resolve()).catch(reject);
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
            ...config
        });
        const MessageType = this.types.get(data.constructor.name) as protobuf.Type;
        const message = MessageType.fromObject(serializedData);
        const wrapper = this.wrapperMessage.create({
            data: {
                type_url: data.constructor.name,
                value: MessageType.encode(message).finish()
            }
        });
        return this.wrapperMessage.encode(wrapper).finish();
    }

    /**
     * Deserialize data
     * @param serializedData Data to deserialze
     * @param dataType Optional data type to specify deserialization type
     * @param config Data serializer configuration
     */
    static deserialize<T>(serializedData: Uint8Array | any, dataType?: Constructor<T>, config?: DataSerializerConfig): T {
        const decodedData: any = this.wrapperMessage.decode(serializedData);
        const typeURL = decodedData.data.type_url;
        const MessageType = this.types.get(typeURL) as protobuf.Type;
        const decodedMessage = MessageType.decode(decodedData.data.value);
        return super.deserialize(decodedMessage as any, dataType || this.knownTypes.get(typeURL) as Constructor<T>, {
            ...this.options,
            ...config
        });
    }
}
