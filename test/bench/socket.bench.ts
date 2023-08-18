import { Suite } from 'benchmark';
import { 
    Absolute3DPosition, 
    AngularVelocity, 
    CallbackSinkNode, 
    DataFrame, 
    DataObject, 
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
const settings = {
    minSamples: 100,
    initCount: 10
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

ProtobufSerializer.initialize().then(() => {
    return buildModels();
}).then(() => {
    suite.add("dataserializer#socket", (deferred: any) => {
        sink1.callback = () => deferred.resolve();
        clientModel1.push(dummyFrame);
    }, settings)
    // .add("protobufserializer#socket", (deferred: any) => {
    //     sink2.callback = () => deferred.resolve();
    //     clientModel2.push(dummyFrame);
    // }, settings)
    .on('cycle', function(event: any) {
        console.log(String(event.target));
    })
    .run(); 
    clientModel1.destroy();
    serverModel1.destroy();
    clientModel2.destroy();
    serverModel2.destroy();
}).catch(console.error);
