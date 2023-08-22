#!/usr/bin/env node

import chalk from 'chalk';
import { ProjectGenerator } from '../generator/ProjectGenerator';
import '@openhps/rf';
import * as path from 'path';
import { input } from '@inquirer/prompts';
import * as yargs from 'yargs';
import {
    Absolute3DPosition,
    Accuracy1D,
    AngleUnit,
    DataFrame,
    DataObject,
    DataSerializer,
    LengthUnit,
    LinearVelocity,
    LinearVelocityUnit,
    Orientation,
    RelativeDistance,
} from '@openhps/core';
import { ProtobufSerializer } from '../ProtobufSerializer';
import { expect } from 'chai';

const args: [K: string] = yargs.argv as any;
const data = {
    directory: path.normalize('tmp'),
};

/**
 * Main CLI entry
 */
function main() {
    console.log(chalk.redBright('OpenHPS Protocol Buffer Generator'));

    if (args['help'] || args['?']) {
        console.log('Command line arguments:');
        console.log('-d <dir>\t\tSpecify the output directory to create the protocol buffer messages.');
        console.log('-v\t\tVerbose logging.');
        process.exit();
    }

    Promise.resolve(
        args['d'] ??
            input({
                message: 'Enter the output directory',
            }),
    ).then((directory) => {
        data.directory = directory;
        prepare();
        generate();
    });
}

/**
 *
 */
function prepare() {
    console.log('Detected serializable packages:');
    ProjectGenerator.getPackages().map((module) => {
        console.log(`\t${module}`);
    });
}

/**
 *
 */
function generate() {
    ProjectGenerator.buildProject(data.directory, args['v'] ? 3 : 2)
        .then((count) => {
            console.log(chalk.green(`${count} protocol buffer messages created!`));
            return test();
        })
        .then(() => {
            process.exit();
        })
        .catch((ex: Error) => {
            console.error(chalk.red(ex.stack));
            process.exit(-1);
        });
}

/**
 *
 */
function test(): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`Performing a self-test of the protocol buffer messages ...`);
        // Load data
        ProtobufSerializer.initialize(data.directory)
            .then(() => {
                // Generic example
                const frame = new DataFrame();
                const object = new DataObject('test', 'Test Object');
                object.setPosition(new Absolute3DPosition(1, 2, 3, LengthUnit.METER));
                object.position.orientation = Orientation.fromEuler({
                    yaw: 50,
                    roll: 10,
                    pitch: 10,
                    unit: AngleUnit.DEGREE,
                });
                object.position.velocity.linear = new LinearVelocity(
                    1,
                    0,
                    0,
                    LinearVelocityUnit.METER_PER_SECOND,
                ).setAccuracy(new Accuracy1D(1, LinearVelocityUnit.CENTIMETER_PER_SECOND));
                object.position.orientation.accuracy = new Accuracy1D(10, AngleUnit.DEGREE);
                object.addRelativePosition(new RelativeDistance('test2', 10, LengthUnit.METER));
                frame.source = object;
                frame.addObject(new DataObject('test2', 'Test Object 2'));
                const buffer = ProtobufSerializer.serialize(frame);
                const deserialized: DataFrame = ProtobufSerializer.deserialize(buffer);
                expect(deserialized).to.not.be.undefined;
                const compare1 = JSON.stringify(DataSerializer.serialize(deserialized), null, 2);
                const compare2 = JSON.stringify(DataSerializer.serialize(frame), null, 2);
                // console.log(compare1);
                // console.log("\n")
                // console.log(compare2)
                expect(compare1).to.eql(compare2);
                console.log(chalk.green(`Basic serialization and deserialization test completed!`));
                resolve();
            })
            .catch(reject);
    });
}

main();
