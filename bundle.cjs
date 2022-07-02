const swc = require("@swc/core");
const config = require("./bundler.config.json");
const cfg = require("cfg-reader");
const path = require("path");
const fs = require("fs");
const mkdirp = require("mkdirp");
const webpack = require("webpack");

function getAllFilesFromFolder(dir) {
    let results = [];
    fs.readdirSync(dir).forEach(function (file) {
        file = dir + "/" + file;
        let stat = fs.statSync(file);

        if (stat && stat.isDirectory()) {
            results = results.concat(getAllFilesFromFolder(file));
        } else results.push(path.resolve(file));
    });
    return results;
}

class Bundler {
    serverConfig;
    srcFolder = path.resolve(__dirname, config.entryResources);
    resourcesFolder = path.resolve(__dirname, config.resourcesFolder);
    resourcesName = this.getDirectories(this.srcFolder);
    webpackFolders = [];

    constructor() {
        this.cleanDirectory(this.resourcesFolder);
        this.setResourcesInConfig();
        this.startBundle();
    }
    startBundle() {
        const files = this.excludeWebpackPackages(getAllFilesFromFolder(config.entryResources));
        for (let index = 0; index < files.length; index++) {
            const srcFilePath = files[index];
            if (!fs.existsSync(srcFilePath)) continue;
            if (this.getFileExtention(srcFilePath) === ".ts" || this.getFileExtention(srcFilePath) === ".tsx") {
                const source = fs.readFileSync(srcFilePath, "utf-8");
                const output = this.swcTransformTypescript(source);
                const outputPath = this.convertTsExtentionToJs(this.getResourcePath(srcFilePath));
                mkdirp(this.getSrcPathWithoutFile(outputPath)).then(
                    () => fs.writeFileSync(path.resolve(__dirname, outputPath), output.code),
                    (r) => console.log(r)
                );
                // console.log(`File \x1b[36m${srcFilePath} \x1b[0mcompiled to \x1b[36m${outputPath}\x1b[0m`);
            } else {
                const outputPath = this.getResourcePath(srcFilePath);
                mkdirp(this.getSrcPathWithoutFile(outputPath)).then(
                    () => fs.copyFileSync(srcFilePath, outputPath),
                    (r) => console.log(r)
                );
            }
        }
        this.compileWebpackPackages();
    }

    swcTransformTypescript(source) {
        return swc.transformSync(source, {
            jsc: {
                parser: {
                    syntax: "typescript",
                    dynamicImport: true,
                    decorators: true,
                    tsx: true,
                },
                transform: {
                    legacyDecorator: true,
                    decoratorMetadata: true,
                },
                target: "es2020",
            },
        });
    }
    getResourcePath(filePath) {
        filePath = path.normalize(filePath);
        const resourcesPath = path.normalize(path.resolve(this.resourcesFolder));
        const srcPath = path.normalize(path.resolve(this.srcFolder));
        return filePath.replace(srcPath, resourcesPath);
    }

    getSrcPathWithoutFile(filePath) {
        const fileName = this.getFileNameFromPath(filePath);
        return path.resolve(filePath.replace(fileName, ""));
    }

    getFileExtention(srcPath) {
        return path.extname(srcPath);
    }

    getFileNameFromPath(srcPath) {
        return path.basename(srcPath);
    }

    getDirectories(source) {
        return fs
            .readdirSync(source, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name);
    }
    setResourcesInConfig() {
        this.serverConfig = new cfg.Config(path.resolve(__dirname, `server.cfg`));
        this.serverConfig.set("resources", this.resourcesName);
        this.serverConfig.save();
    }
    cleanDirectory(dirPath) {
        if (!config.cleanResourcesDirectory) return;

        try {
            var files = fs.readdirSync(dirPath);
        } catch (e) {
            return;
        }
        if (files.length > 0)
            for (var i = 0; i < files.length; i++) {
                var filePath = dirPath + "/" + files[i];
                if (fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
                else this.cleanDirectory(filePath);
            }
        fs.rmdirSync(dirPath);
    }
    convertTsExtentionToJs(srcPath) {
        return srcPath.replace(/\.tsx?$/, ".js");
    }

    excludeWebpackPackages(files) {
        for (let index = 0; index < files.length; index++) {
            const element = files[index];
            if (this.getFileNameFromPath(element).includes("webpack.config")) {
                this.webpackFolders.push(this.getSrcPathWithoutFile(element));
            }
        }
        for (let index = 0; index < this.webpackFolders.length; index++) {
            const webpackFolder = this.webpackFolders[index];
            for (let index = 0; index < files.length; index++) {
                const filePath = files[index];
                if (filePath.includes(webpackFolder)) {
                    files.splice(index, 1);
                    index--;
                }
            }
        }
        return files;
    }

    compileWebpackPackages() {
        for (let index = 0; index < this.webpackFolders.length; index++) {
            const element = this.webpackFolders[index];
            const webpackConfig = require(path.resolve(__dirname, `${element}/webpack.config.cjs`));
            webpackConfig.output = {
                path: this.getResourcePath(element),
                filename: "index.js",
            };
            const compiler = webpack(webpackConfig);
            compiler.run((err, stats) => {
                if (err) console.error(err);
                compiler.close((closeErr) => {
                    if (err) console.error(closeErr);
                });
            });
        }
    }
}
new Bundler();
