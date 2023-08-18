import 'mocha';
import { CallbackSinkNode, DataFrame, DataObject, Model, ModelBuilder } from '@openhps/core';
import { SocketClient, SocketClientSink, SocketServer, SocketServerSource } from '@openhps/socket';
import { ProtobufSerializer } from '../../src';
import * as http from 'http';

describe("Socket Serialization", () => {
    let clientModel: Model;
    let serverModel: Model;
    let sink: CallbackSinkNode<any>;
    let server: http.Server;

    before((done) => {
        sink = new CallbackSinkNode();
        // Initialize the protocol buffer messages
        ProtobufSerializer.initialize();

        // Create web server
        server = http.createServer();
        server.listen(1587);

        // Create models
        ModelBuilder.create()
            .addService(new SocketServer({
                srv: server,
                path: "/api/v1"
            }))
            .from(new SocketServerSource({
                uid: "source",
                serialize: (obj) => ProtobufSerializer.serialize(obj),
                deserialize: (obj) => ProtobufSerializer.deserialize(obj)
            }))
            .to(sink)
            .build().then(model => {
                serverModel = model;

                return ModelBuilder.create()
                    .addService(new SocketClient({
                        url: "http://localhost:1587",
                        path: "/api/v1",
                    }))
                    .from()
                    .to(new SocketClientSink({
                        uid: "source",
                        serialize: (obj) => ProtobufSerializer.serialize(obj),
                        deserialize: (obj) => ProtobufSerializer.deserialize(obj)
                    }))
                    .build();
            }).then(model => {
                clientModel = model;
                done();
            }).catch(done);
    });

    after(() => {
        clientModel.destroy();
        serverModel.destroy();
        server.close();
    });

    it('should use protocol buffers to send data', (done) => {
        sink.callback = () => done();
        clientModel.once('error', done);
        clientModel.push(new DataFrame(new DataObject("test")));        
    });
});
