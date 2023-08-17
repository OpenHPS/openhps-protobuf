import { DataSerializer, DataSerializerUtils, ObjectMetadata, Serializable } from '@openhps/core';
import { ObjectGenerator } from './ObjectGenerator';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as chalk from 'chalk';

/**
 * Project generator
 */
export class ProjectGenerator extends DataSerializer {
    private static _modules: Set<string> = new Set();
    private static _packages: Set<string> = new Set();

    static findModule(dir: string): string {
        const packageFile = path.join(dir, 'package.json');
        if (fs.existsSync(packageFile)) {
            const packageJson = JSON.parse(fs.readFileSync(packageFile, { encoding: 'utf-8' }));
            return packageJson.name;
        } else {
            const completeDir = dir.split(path.sep);
            completeDir.pop();
            return this.findModule(completeDir.join(path.sep));
        }
    }

    static loadModules(objects: Array<Serializable<any>>, module: NodeModule = require.main) {
        if (module === undefined) {
            // Use cache instead
            Object.values(require.cache).map((m) => this.loadModules(objects, m));
            return;
        }
        this._modules.add(module.id);
        Object.keys(module.exports).forEach((key) => {
            const childModule = module.exports[key];
            if (objects.includes(childModule)) {
                childModule.prototype._module = this.findModule(path.dirname(require.resolve(module.id)));
                this._packages.add(childModule.prototype._module);
            }
        });
        module.children.forEach((module) => {
            if (!this._modules.has(module.id)) {
                this.loadModules(objects, module);
            }
        });
    }

    static getPackages(): string[] {
        if (this._packages.size === 0) {
            this.loadClasses();
        }
        return Array.from(this._packages.values());
    }

    static loadClasses(): Array<ObjectMetadata> {
        const declarations: Array<ObjectMetadata> = [];
        this.knownTypes.forEach((value) => {
            const metadata = DataSerializerUtils.getOwnMetadata(value);
            const metadataClone = { ...metadata };
            metadataClone.dataMembers = new Map(metadataClone.dataMembers);
            if (metadata) {
                declarations.push(metadataClone as ObjectMetadata);
            }
        });
        this.loadModules(declarations.map((d) => d.classType));
        return declarations;
    }

    static generateProtoMessages(): Promise<Map<string, [string, string]>> {
        return new Promise((resolve) => {
            const classes = new Map();
            this.loadClasses().forEach((objectMetadata) => {
                const javaClass = ObjectGenerator.createProtoMessage(objectMetadata);
                classes.set(objectMetadata.classType.name, javaClass);
            });
            resolve(classes);
        });
    }

    static buildProject(directory: string, verbose?: boolean): Promise<number> {
        return new Promise((resolve, reject) => {
            // Prepare directories
            if (fs.existsSync(directory)) {
                fs.rmSync(directory, { recursive: true });
            }
            fs.mkdirSync(directory, { recursive: true });

            // Get all class sources
            ProjectGenerator.generateProtoMessages()
                .then((classes) => {
                    classes.forEach((value, key) => {
                        if (verbose) {
                            console.log(chalk.italic(`Generating ${key} of module ${value[0]}`));
                        }
                        const packageDir = path.join(directory, ...value[0].split('.'));
                        if (!fs.existsSync(packageDir)) {
                            fs.mkdirsSync(packageDir);
                        }
                        fs.writeFileSync(path.join(packageDir, key + '.proto'), value[1], {
                            encoding: 'utf-8',
                        });
                    });
                    resolve(classes.size);
                })
                .catch(reject);
        });
    }
}
