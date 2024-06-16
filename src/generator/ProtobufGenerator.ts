import { Constructor, NumberType, ObjectMemberMetadata } from "@openhps/core";

export abstract class ProtobufGenerator<T> {
    protected options: ProtobufGeneratorOptions;
    /**
     * Logger
     */
    logger: (level: string, message: any) => void = () => {};

    constructor(options?: ProtobufGeneratorOptions) {
        this.options = options;
    }

    protected static getNumberType(numberType: NumberType): string {
        switch (numberType) {
            case NumberType.DECIMAL:
            case NumberType.DOUBLE:
                return 'double';
            case NumberType.FLOAT:
                return 'float';
            case NumberType.LONG:
                return 'int64';
            case NumberType.INTEGER:
            case NumberType.SHORT:
                return 'int32';
            default:
                return 'string';
        }
    }

    abstract processObject(object: Constructor<T>, metaData: ObjectMemberMetadata): Promise<void>;

    abstract generate(object: Constructor<T>, metaData: ObjectMemberMetadata): Promise<ProtobufMessage>;
}

export interface ProtobufGeneratorOptions {
    
}

export interface ProtobufMessage {
    body: string;
    namespace: string;
}

export type ProtobufPrimitive = 'string' | 'int32' | 'bool' | 'bytes';
export interface TypeMapping {
    syntax: ProtobufPrimitive | string;
    types?: TypeMapping[];
    package?: string;
    name?: string;
}
