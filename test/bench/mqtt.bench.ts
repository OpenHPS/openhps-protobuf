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
import { MQTTClient, MQTTSourceNode, MQTTServer, MQTTSinkNode } from '@openhps/mqtt';

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
    minSamples: 50,
    initCount: 5,
    defer: true,
};
const sink2 = new CallbackSinkNode();
const sink1 = new CallbackSinkNode();
let serverModel1: Model;
let clientModel1: Model;
let serverModel2: Model;
let clientModel2: Model;

function buildModels(): Promise<void> {
    return new Promise((resolve, reject) => {

        ModelBuilder.create()
            .addService(new MQTTServer({
                port: 1443,
            }))
            .from(new MQTTSourceNode({
                uid: "source",
                serialize: (obj) => ProtobufSerializer.serialize(obj),
                deserialize: (obj) => ProtobufSerializer.deserialize(obj)
            }))
            .to(sink2)
            .build().then(model => {
                serverModel2 = model;
                return ModelBuilder.create()
                    .addService(new MQTTClient({
                        url: 'mqtt://localhost:1443',
                    }))
                    .from()
                    .to(new MQTTSinkNode({
                        uid: "source",
                        serialize: (obj) => ProtobufSerializer.serialize(obj),
                        deserialize: (obj) => ProtobufSerializer.deserialize(obj)
                    }))
                    .build();
            }).then(model => {
                clientModel2 = model;
                return ModelBuilder.create()
                    .addService(new MQTTServer({
                        port: 1444,
                    }))
                    .from(new MQTTSourceNode({
                        uid: "source",
                    }))
                    .to(sink1)
                    .build();
            }).then(model => {
                serverModel1 = model;
                return ModelBuilder.create()
                    .addService(new MQTTClient({
                        url: 'mqtt://localhost:1444',
                    }))
                    .from()
                    .to(new MQTTSinkNode({
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

    ProtobufSerializer.deserialize(ProtobufSerializer.serialize(dummyFrame));
    
    console.log("Building models ...");
    return buildModels();
}).then(() => {
    console.log("Starting benchmark ...");
    clientModel1.on('error', console.error);
    clientModel2.on('error', console.error);
    serverModel1.on('error', console.error);
    serverModel2.on('error', console.error);
    suite.add("dataserializer#mqtt", (deferred: Deferred) => {
        sink1.callback = () => deferred.resolve();
        clientModel1.push(dummyFrame);
    }, settings)
    .add("protobufserializer#mqtt", (deferred: Deferred) => {
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
