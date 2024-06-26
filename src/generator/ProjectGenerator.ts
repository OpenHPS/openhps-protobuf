import { DataSerializer, DataSerializerUtils, ObjectMetadata, Serializable } from '@openhps/core';
import { ObjectGenerator } from './ObjectGenerator';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { COMMON } from './constants';
import { ProjectBuildOptions } from './types';

/**
 * Project generator
 */
export class ProjectGenerator extends DataSerializer {
    private static _modules: Set<string> = new Set();
    private static _packages: Set<string> = new Set();

    static findAllModules(dir: string): NodeModule[] {
        const packageFile = path.resolve(path.join(dir, 'package.json'));
        if (packageFile === path.resolve(require.main?.path)) {
            return [];
        }

        if (fs.existsSync(packageFile)) {
            const packageJson = JSON.parse(fs.readFileSync(packageFile, { encoding: 'utf-8' }));
            const dependencies = packageJson.dependencies;
            const devDependencies = packageJson.devDependencies;

            // Combine dependencies and devDependencies
            const allDependencies = { ...dependencies, ...devDependencies };

            // Get the names of all modules
            const allModuleNames = Object.keys(allDependencies);
            const allModules = allModuleNames
                .map((name) => {
                    try {
                        require(name);
                        return require.cache[require.resolve(name)];
                    } catch (error) {
                        return null;
                    }
                })
                .filter(Boolean) as NodeModule[];
            return allModules;
        }
    }

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
        if (module.exports) {
            Object.keys(module.exports).forEach((key) => {
                const childModule = module.exports[key];
                if (objects.includes(childModule)) {
                    childModule.prototype._module = this.findModule(path.dirname(require.resolve(module.id)));
                    this._packages.add(childModule.prototype._module);
                }
            });
        }
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
        this.findAllModules('./');
        this.knownTypes.forEach((value) => {
            const metadata = DataSerializerUtils.getOwnMetadata(value);
            if (metadata) {
                declarations.push(metadata);
            }
        });
        this.loadModules(declarations.map((d) => d.classType));
        return declarations;
    }

    static generateProtoMessages(options: ProjectBuildOptions): Promise<Map<string, [string, string]>> {
        return new Promise((resolve) => {
            const classes = new Map();
            const metaData = this.loadClasses();

            metaData.forEach((objectMetadata) => {
                ObjectGenerator.processObject(objectMetadata, options);
            });

            metaData.forEach((objectMetadata) => {
                if (options.logLevel > 2) {
                    console.log(
                        chalk.italic(
                            `Generating ${objectMetadata.classType.name}`,
                            objectMetadata.classType.prototype._module
                                ? `of module ${objectMetadata.classType.prototype._module}`
                                : '',
                        ),
                    );
                }
                const javaClass = ObjectGenerator.createProtoMessage(objectMetadata, options);
                classes.set(objectMetadata.classType.name, javaClass);
            });
            resolve(classes);
        });
    }

    static buildProject(directory: string, options: ProjectBuildOptions = {}): Promise<number> {
        return new Promise((resolve, reject) => {
            // Prepare directories
            if (fs.existsSync(directory)) {
                fs.rmSync(directory, { recursive: true });
            }
            fs.mkdirSync(directory, { recursive: true });

            // Get all class sources
            if (options.logLevel > 0) {
                console.log('Generating protocol buffer messages ...');
                console.log('Use of any types = ', options.useAnyType);
            }
            ProjectGenerator.generateProtoMessages(options)
                .then((classes) => {
                    if (options.logLevel > 0) console.log('Saving generating protocol buffer messages ...');
                    classes.forEach((value, key) => {
                        const packageDir = path.join(directory, ...value[0].split('.'));
                        if (!fs.existsSync(packageDir)) {
                            fs.mkdirsSync(packageDir);
                        }
                        fs.writeFileSync(path.join(packageDir, key + '.proto'), value[1], {
                            encoding: 'utf-8',
                        });
                    });

                    fs.writeFileSync(path.join(directory, 'common.proto'), COMMON, {
                        encoding: 'utf-8',
                    });

                    resolve(classes.size);
                })
                .catch(reject);
        });
    }
}
