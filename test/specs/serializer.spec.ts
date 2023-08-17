import { Absolute3DPosition, AngleUnit, DataObject, DataSerializer, DataSerializerUtils, LengthUnit, Orientation, RelativeDistance, Velocity } from '@openhps/core';
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

    describe('knownTypes', () => {
        it('should not break knownTypes', () => {
            expect(DataSerializerUtils.getOwnMetadata(Velocity).knownTypes.size).to.eql(1);
        });
    });
});
