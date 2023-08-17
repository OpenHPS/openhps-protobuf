import 'mocha';
import { ModelBuilder } from '@openhps/core';
import { SocketClient, SocketClientSink } from '@openhps/socket';
import { ProtobufSerializer } from '../../src';

describe("Socket Serialization", () => {
    before((done) => {
        // Initialize the protocol buffer messages
        ProtobufSerializer.initialize();
        ModelBuilder.create()
            .addService(new SocketClient({
                url: "",
                path: "",
            }))
            .from()
            .to(new SocketClientSink({
                serialize: (obj) => ProtobufSerializer.serialize(obj),
                deserialize: (obj) => ProtobufSerializer.deserialize(obj)
            }));
    });
});
