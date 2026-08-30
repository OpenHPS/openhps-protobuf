/**
 * Encode a fixed data object with the protobuf serializer and print its length and hash.
 *
 * Run as its own process on purpose. ProtobufSerializer.initialize() is not idempotent:
 * it stores schema state on the ObjectMetadata it reads from @openhps/core, in the same
 * `protobuf` slot the generator uses, so a second initialize() in one process yields a
 * different - shorter - encoding. Only the first call in a process is representative of
 * what a consumer actually gets.
 *
 * Usage: ts-node test/helpers/wire-hash.ts
 */
import { createHash } from 'crypto';
import {
    DataObject,
    Absolute3DPosition,
    LengthUnit,
    LinearVelocity,
    Orientation,
    Accuracy1D,
    AngleUnit,
} from '@openhps/core';
import { ProtobufSerializer } from '../../src/ProtobufSerializer';

/**
 * Build a data object with every timestamp pinned.
 *
 * setPosition() restamps the position, and LinearVelocity and Orientation each carry
 * their own construction timestamp at microsecond resolution, so all of them have to be
 * fixed or the encoding differs from run to run.
 * @returns {DataObject} A data object whose encoding is reproducible
 */
function fixture(): DataObject {
    const object = new DataObject('wire-test', 'Wire Test');
    object.createdTimestamp = 1700000000000;

    const position = new Absolute3DPosition(1.5, -2.25, 3.125, LengthUnit.METER);
    position.accuracy = new Accuracy1D(0.5, LengthUnit.METER);
    position.linearVelocity = new LinearVelocity(0.25, 0.5, 0.75);
    position.orientation = Orientation.fromEuler({ x: 10, y: 20, z: 30, unit: AngleUnit.DEGREE });
    object.setPosition(position);

    const stored: any = object.getPosition();
    stored.timestamp = 1700000000000;
    stored.linearVelocity.timestamp = 1700000000000;
    stored.velocity.linear.timestamp = 1700000000000;
    stored.orientation.timestamp = 1700000000000;
    return object;
}

ProtobufSerializer.initialize()
    .then(() => {
        const object = fixture();
        const bytes = ProtobufSerializer.serialize(object);
        const restored = ProtobufSerializer.deserialize(bytes) as DataObject;
        const position = restored.getPosition() as Absolute3DPosition;
        console.log(
            JSON.stringify({
                length: bytes.length,
                sha256: createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
                roundTrip: {
                    uid: restored.uid,
                    displayName: restored.displayName,
                    x: position.x,
                    y: position.y,
                    z: position.z,
                    unit: position.unit.name,
                    accuracy: position.accuracy.valueOf(),
                },
            }),
        );
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
