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
        // require.main is undefined when mocha runs the specs through its ESM loader.
        const mainPath = require.main?.path;
        if (mainPath !== undefined && packageFile === path.resolve(mainPath)) {
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
        const resolvedDir = path.resolve(dir);
        const packageFile = path.join(resolvedDir, 'package.json');
        if (fs.existsSync(packageFile)) {
            const packageJson = JSON.parse(fs.readFileSync(packageFile, { encoding: 'utf-8' }));
            return packageJson.name;
        } else {
            const parentDir = path.dirname(resolvedDir);
            if (parentDir === resolvedDir) {
                // Reached the filesystem root without finding a manifest
                throw new Error(`Unable to find a package.json above '${dir}'`);
            }
            return this.findModule(parentDir);
        }
    }

    static loadModules(objects: Array<Serializable<any>>, module: NodeModule = require.main) {
        if (module === undefined) {
            // Use cache instead. require.main is undefined under mocha's ESM loader, and
            // the cache is typed as possibly holding undefined entries.
            Object.values(require.cache)
                .filter((cached): cached is NodeModule => cached !== undefined && Array.isArray(cached.children))
                .forEach((cached) => this.loadModules(objects, cached));
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
        if (!Array.isArray(module.children)) {
            return;
        }
        module.children.forEach((child) => {
            if (child !== undefined && !this._modules.has(child.id)) {
                this.loadModules(objects, child);
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
        // Reset so a second build in the same process does not reuse stale module/package state
        this._modules = new Set();
        this._packages = new Set();
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
            (async () => {
                const resolvedDirectory = path.resolve(directory);
                // The CLI passes -d <dir> verbatim: refuse to delete the current working
                // directory, one of its parents, or the filesystem root
                if (
                    resolvedDirectory === path.parse(resolvedDirectory).root ||
                    resolvedDirectory === process.cwd() ||
                    process.cwd().startsWith(resolvedDirectory + path.sep)
                ) {
                    throw new Error(
                        `Refusing to use '${resolvedDirectory}': it is the current working directory, a parent of it, or the filesystem root.`,
                    );
                }

                // Prepare directories
                if (await fs.pathExists(resolvedDirectory)) {
                    await fs.promises.rm(resolvedDirectory, { recursive: true });
                }
                await fs.promises.mkdir(resolvedDirectory, { recursive: true });

                // Get all class sources
                if (options.logLevel > 0) {
                    console.log('Generating protocol buffer messages ...');
                    console.log('Use of any types = ', options.useAnyType);
                }
                const classes = await ProjectGenerator.generateProtoMessages(options);
                if (options.logLevel > 0) console.log('Saving generating protocol buffer messages ...');
                for (const [key, value] of classes) {
                    const packageDir = path.join(resolvedDirectory, ...value[0].split('.'));
                    await fs.ensureDir(packageDir);
                    await fs.promises.writeFile(path.join(packageDir, key + '.proto'), value[1], {
                        encoding: 'utf-8',
                    });
                }

                await fs.promises.writeFile(path.join(resolvedDirectory, 'common.proto'), COMMON, {
                    encoding: 'utf-8',
                });

                resolve(classes.size);
            })().catch(reject);
        });
    }
}
