import 'mocha';
import { expect } from 'chai';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const GOLDEN = path.join(__dirname, '../golden/protos');

/**
 * List every file in a directory tree, relative to it, sorted.
 * @param {string} root Directory to walk
 * @returns {string[]} Relative file paths
 */
function listFiles(root: string): string[] {
    const out: string[] = [];
    (function walk(dir: string) {
        for (const entry of fs.readdirSync(dir).sort()) {
            const full = path.join(dir, entry);
            if (fs.statSync(full).isDirectory()) walk(full);
            else out.push(path.relative(root, full));
        }
    })(root);
    return out.sort();
}

describe('Generator', () => {
    describe('golden files', () => {
        let generated: string;

        before(function () {
            this.timeout(180000);
            generated = fs.mkdtempSync(path.join(os.tmpdir(), 'openhps-protobuf-golden-'));
            // Generated in its own process on purpose -- see test/helpers/build-protos.ts.
            execFileSync(
                process.execPath,
                ['-r', path.join(__dirname, '../tsconfig.js'), path.join(__dirname, '../helpers/build-protos.ts'), generated],
                { stdio: 'pipe' },
            );
        });

        after(() => {
            if (generated) fs.rmSync(generated, { recursive: true, force: true });
        });

        it('should emit the same set of schema files', () => {
            expect(listFiles(generated)).to.deep.equal(listFiles(GOLDEN));
        });

        it('should emit byte-identical schemas', () => {
            const differing: string[] = [];
            for (const file of listFiles(GOLDEN)) {
                const actualPath = path.join(generated, file);
                if (!fs.existsSync(actualPath)) continue;
                const actual = fs.readFileSync(actualPath, 'utf-8');
                const expected = fs.readFileSync(path.join(GOLDEN, file), 'utf-8');
                if (actual !== expected) differing.push(file);
            }
            expect(differing, `schemas changed:\n  ${differing.join('\n  ')}\nRegenerate with: npm run build:golden`).to.be
                .empty;
        });
    });
});
