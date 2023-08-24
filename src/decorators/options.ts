import { SerializableObjectOptions, MemberOptionsBase, ObjectMetadata, Serializable } from '@openhps/core';
import { Type } from 'protobufjs';

export type { SerializableObjectOptions, MemberOptionsBase, ObjectMetadata };

declare module '@openhps/core/dist/types/data/decorators/options' {
    export interface MemberOptionsBase {
        protobuf?: {
            optional?: boolean;
        };
    }
}

declare module '@openhps/core/dist/types/data/decorators/metadata' {
    export interface ObjectMetadata {
        protobuf?: {
            messageType?: Type;
            messageTypeEnum?: number;
            subTypes?: Serializable<any>[];
            subModules?: Set<string>;
            type?: Serializable<any>;
            enumMapping?: Map<number, string>;
        };
    }
}
