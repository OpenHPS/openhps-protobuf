#!/usr/bin/env node

import * as chalk from 'chalk';
import { ProjectGenerator } from './ProjectGenerator';
import '@openhps/rf'
import { ProtobufSerializer } from '../ProtobufSerializer';
import * as path from 'path';
import { Absolute3DPosition, DataFrame, DataObject } from '@openhps/core';

console.log(chalk.redBright("OpenHPS Protocol Buffer Generator"));
ProjectGenerator.buildProject().then(() => {
    return ProtobufSerializer.initialize(path.join(__dirname, "../../tmp"))
}).then(() => {
    const serialized = ProtobufSerializer.serialize(new DataFrame(
        new DataObject("test").setPosition(new Absolute3DPosition(10, 5, 9)
            .setAccuracy(10))
    ));
    console.log(serialized);    

    console.log(ProtobufSerializer.deserialize(serialized))
});
