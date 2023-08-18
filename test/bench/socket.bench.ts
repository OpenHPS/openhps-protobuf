import { Deferred, Options, Suite } from 'benchmark';
import { 
    Absolute3DPosition, 
    AngularVelocity, 
    CallbackSinkNode, 
    DataFrame, 
    DataObject, 
    DataSerializer, 
    LinearVelocity, 
    Model, 
    ModelBuilder, 
    Orientation 
} from '@openhps/core';
import { ProtobufSerializer } from '../../src';
import { SocketClient, SocketClientSink, SocketServer, SocketServerSource } from '@openhps/socket';
import * as http from 'http';

const dummyFrame = new DataFrame();
const dummyObject = new DataObject("dummy", "Dummy Data Object");
const position = new Absolute3DPosition(1, 2, 3);
position.velocity.linear = new LinearVelocity(0.1, 0.1, 0.1);
position.velocity.angular = new AngularVelocity(0.1, 0.1, 0.1);
position.orientation = new Orientation(1, 2, 3, 1);
dummyObject.setPosition(position);
dummyFrame.source = dummyObject;
dummyFrame.addObject(dummyObject);

const suite = new Suite();
const settings: Options = {
    minSamples: 100,
    initCount: 10,
    defer: true,
};
const server1 = http.createServer();
const server2 = http.createServer();
const sink2 = new CallbackSinkNode();
const sink1 = new CallbackSinkNode();
let serverModel1: Model;
let clientModel1: Model;
let serverModel2: Model;
let clientModel2: Model;

function buildModels(): Promise<void> {
    return new Promise((resolve, reject) => {
        server1.listen(1587);
        server2.listen(1588);

        ModelBuilder.create()
            .addService(new SocketServer({
                srv: server2,
                path: "/api/v2"
            }))
            .from(new SocketServerSource({
                uid: "source",
                serialize: (obj) => ProtobufSerializer.serialize(obj),
                deserialize: (obj) => ProtobufSerializer.deserialize(obj)
            }))
            .to(sink2)
            .build().then(model => {
                serverModel2 = model;
                return ModelBuilder.create()
                    .addService(new SocketClient({
                        url: "http://localhost:1588",
                        path: "/api/v2",
                    }))
                    .from()
                    .to(new SocketClientSink({
                        uid: "source",
                        serialize: (obj) => ProtobufSerializer.serialize(obj),
                        deserialize: (obj) => ProtobufSerializer.deserialize(obj)
                    }))
                    .build();
            }).then(model => {
                clientModel2 = model;
                return ModelBuilder.create()
                    .addService(new SocketServer({
                        srv: server1,
                        path: "/api/v1"
                    }))
                    .from(new SocketServerSource({
                        uid: "source",
                    }))
                    .to(sink1)
                    .build();
            }).then(model => {
                serverModel1 = model;
                return ModelBuilder.create()
                    .addService(new SocketClient({
                        url: "http://localhost:1587",
                        path: "/api/v1",
                    }))
                    .from()
                    .to(new SocketClientSink({
                        uid: "source",
                    }))
                    .build();
            }).then(model => {
                clientModel1 = model;
                resolve();
            }).catch(reject);
    });
}

console.log("Initializing buffers ...");
ProtobufSerializer.initialize().then(() => {

    console.log("JSON length", Buffer.from(JSON.stringify(DataSerializer.serialize(dummyFrame))).byteLength);
    console.log("Protobuf length", ProtobufSerializer.serialize(dummyFrame).byteLength);

    console.log("Building models ...");
    return buildModels();
}).then(() => {
    console.log("Starting benchmark ...");
    clientModel1.on('error', console.error);
    clientModel2.on('error', console.error);
    serverModel1.on('error', console.error);
    serverModel2.on('error', console.error);
    suite.add("dataserializer#socket", (deferred: Deferred) => {
        sink1.callback = () => deferred.resolve();
        clientModel1.push(dummyFrame);
    }, settings)
    .add("protobufserializer#socket", (deferred: Deferred) => {
        sink2.callback = () => deferred.resolve();
        clientModel2.push(dummyFrame);
    }, settings)
    .on('cycle', function(event: any) {
        console.log(String(event.target));
    })
    .run();

    // clientModel1.destroy();
    // serverModel1.destroy();
    // clientModel2.destroy();
    // serverModel2.destroy();
    // server1.close();
    // server2.close();
}).catch(console.error);
