import { Absolute3DPosition, Accuracy1D, AngleUnit, DataFrame, DataObject, DataSerializer, DataSerializerUtils, LengthUnit, LinearVelocity, LinearVelocityUnit, Orientation, RelativeDistance, Velocity } from '@openhps/core';
import { expect } from 'chai';
import 'mocha';
import { ProtobufSerializer } from '../../src';

describe("Serializer", () => {
    before(async () => {
        await ProtobufSerializer.initialize();
    })
    describe('clone()', () => {
        it('should not break cloning objects', () => {
            const object = new DataObject("test", "Test Object");
            object.setPosition(new Absolute3DPosition(1, 2, 3, LengthUnit.METER));
            object.position.orientation = Orientation.fromEuler({
                yaw: 50, roll: 10, pitch: 10, unit: AngleUnit.DEGREE
            });
            object.addRelativePosition(new RelativeDistance("test2", 10, LengthUnit.METER));
            object.clone();
        });
    });

    describe('serialize()', () => {
        it('should serialize any type members', () => {
            const linearVelocity = new LinearVelocity(1, 2, 3, LinearVelocityUnit.METER_PER_SECOND);
            const deserialized = ProtobufSerializer.deserialize(ProtobufSerializer.serialize(linearVelocity));
            expect(DataSerializer.serialize(linearVelocity)).to.eql(DataSerializer.serialize(deserialized));
        });
    });

    describe('deserialize()', () => {
        it('should deserialize units', () => {
            const velocity = new Velocity();
            velocity.linear = new LinearVelocity(
                1,
                0,
                0,
                LinearVelocityUnit.METER_PER_SECOND,
            ).setAccuracy(new Accuracy1D(1, LinearVelocityUnit.CENTIMETER_PER_SECOND));
            const buffer = ProtobufSerializer.serialize(velocity);
            const deserialized: Velocity = ProtobufSerializer.deserialize(buffer);
            expect(deserialized.linear.unit).to.be.instanceOf(LinearVelocityUnit);
        });
    });

    describe('knownTypes', () => {
        it('should not break knownTypes', () => {
            expect(DataSerializerUtils.getOwnMetadata(Velocity).knownTypes.size).to.eql(1);
            DataSerializer.deserialize(DataSerializer.serialize(new Absolute3DPosition()));
            expect(DataSerializerUtils.getOwnMetadata(Velocity).knownTypes.size).to.eql(1);
            expect(DataSerializerUtils.getOwnMetadata(Orientation).knownTypes.size).to.eql(1);
        });
    });
});
