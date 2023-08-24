import { Suite } from 'benchmark';
import { 
    Absolute3DPosition, 
    AngularVelocity, 
    DataFrame, 
    DataObject, 
    DataSerializer,
    LinearVelocity, 
    Orientation 
} from '@openhps/core';
import { ProtobufSerializer } from '../../src';
// import {
//     RDFSerializer
// } from '@openhps/rdf';

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
    minSamples: 50,
    initCount: 5
};

let serialized: any;
let deserialized: DataFrame;

ProtobufSerializer.initialize().then(() => {
    suite.add("dataserializer#serialize (simple)", () => {
        serialized = DataSerializer.serialize(dummyObject.position);
    }, settings)
    .add("dataserializer#deserialize (simple)", () => {
        deserialized = DataSerializer.deserialize(serialized);
    }, settings)
    .add("protobufserializer#serialize (simple)", () => {
        serialized = ProtobufSerializer.serialize(dummyObject.position);
    }, settings)
    .add("protobufserializer#deserialize (simple)", () => {
        deserialized = ProtobufSerializer.deserialize(serialized);
    }, settings)
    // .add("rdfserializer#serialize (simple)", () => {
    //     serialized = RDFSerializer.serialize(dummyObject.position);
    // }, settings)
    // .add("rdfserializer#deserialize (simple)", () => {
    //     deserialized = RDFSerializer.deserialize(serialized);
    // }, settings)
    .add("dataserializer#serialize (advanced)", () => {
        serialized = DataSerializer.serialize(dummyFrame);
    }, settings)
    .add("dataserializer#deserialize (advanced)", () => {
        deserialized = DataSerializer.deserialize(serialized);
    }, settings)
    .add("protobufserializer#serialize (advanced)", () => {
        serialized = ProtobufSerializer.serialize(dummyFrame);
    }, settings)
    .add("protobufserializer#deserialize (advanced)", () => {
        deserialized = ProtobufSerializer.deserialize(serialized);
    }, settings)
    // .add("rdfserializer#serialize (advanced)", () => {
    //     serialized = RDFSerializer.serialize(dummyFrame);
    // }, settings)
    // .add("rdfserializer#deserialize (advanced)", () => {
    //     deserialized = RDFSerializer.deserialize(serialized);
    // }, settings)
    .on('cycle', function(event: any) {
        console.log(String(event.target));
    })
    .run(); 

}).catch(console.error);
