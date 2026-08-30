/**
 * Generate the protobuf schemas into a directory and exit.
 *
 * Run as its own process on purpose. ObjectGenerator.processObject writes generator
 * state onto the ObjectMetadata it reads from @openhps/core, and that slot is shared
 * with the runtime serializer, so a second invocation inside one process does not
 * produce the same schemas as the first. A fresh process is deterministic, which is
 * what makes the golden comparison meaningful.
 *
 * Usage: ts-node test/helpers/build-protos.ts <output-directory>
 */
import { ProjectGenerator } from '../../src/generator/ProjectGenerator';

const directory = process.argv[2];
if (!directory) {
    console.error('usage: build-protos.ts <output-directory>');
    process.exit(2);
}

ProjectGenerator.buildProject(directory, { logLevel: 0, useAnyType: false })
    .then((count) => {
        console.log(`generated ${count}`);
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
