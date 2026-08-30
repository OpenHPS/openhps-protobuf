import 'mocha';
import { expect } from 'chai';
import { execFileSync } from 'child_process';
import * as path from 'path';

describe('Wire format', () => {
    let result: any;

    before(function () {
        this.timeout(180000);
        // Encoded in its own process -- see test/helpers/wire-hash.ts.
        const output = execFileSync(
            process.execPath,
            ['-r', path.join(__dirname, '../tsconfig.js'), path.join(__dirname, '../helpers/wire-hash.ts')],
            { encoding: 'utf-8', stdio: 'pipe' },
        );
        result = JSON.parse(output.trim().split('\n').pop());
    });

    it('should encode a data object to a stable byte sequence', () => {
        // Recorded against protobufjs 7.6.6 and confirmed unchanged on 8.8.0. A change
        // here means the encoding moved, which breaks every peer already on the wire.
        expect(result.length).to.equal(331);
        expect(result.sha256).to.equal('1accb98ae3581a8cfe877c40461b6b819ed340ba47a87f11a73feb3e6c75e9ad');
    });

    it('should round trip a data object through the wire format', () => {
        expect(result.roundTrip).to.deep.equal({
            uid: 'wire-test',
            displayName: 'Wire Test',
            x: 1.5,
            y: -2.25,
            z: 3.125,
            unit: 'meter',
            accuracy: 0.5,
        });
    });
});
