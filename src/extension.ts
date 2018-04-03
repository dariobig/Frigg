'use strict';

import * as fs from 'fs';
import * as path from 'path';
import {homedir} from 'os';
import {workspace, window, commands, ExtensionContext, Disposable, QuickPickOptions, Uri, TextDocument, TextEditor, ViewColumn} from 'vscode';
import Params, {validateParamsMap, ParamsMap} from './params';
import ReplacementProvider from './replacementProvider';
import InterfaceBuilder from './interfaceBuilder';
import {mkFileDirRecursive} from './utils';

const request = require('request');

export function activate(context: ExtensionContext) {

    const replacementProvider = new ReplacementProvider();

    const providerRegistrations = Disposable.from(
        workspace.registerTextDocumentContentProvider(ReplacementProvider.scheme, replacementProvider)
    );

    const replaceParamsCmd = commands.registerTextEditorCommand('frigg.replaceParameters', editor => {
        replaceParams(editor.document, nextColumn(editor));
    });

    const replaceParamsToFileCmd = commands.registerTextEditorCommand('frigg.replaceParamsToFile', editor => {
        replaceParams(editor.document, nextColumn(editor), false);
    });

    const downloadTemplatesCmd = commands.registerCommand('frigg.downloadTemplates', () => {
        let resource = window.activeTextEditor ? window.activeTextEditor.document.uri : undefined;
        downloadTemplates(resource).then(files => {}, err => {
            if (err !== undefined && err !== null && err !== '') {
                window.showErrorMessage(err);
            }
        });
    });

    // TODO: add command to show template folder / files

    const generateScriptFromParamsCmd = commands.registerTextEditorCommand('frigg.generateScriptFromParams', editor => {
        // Find template folder, if not set ask to run download
        // Pick template file from folder, or any
        // ...
        
        let paramsMap = validateParamsMap(Params.parseParameters(editor.document.getText()));
        if (paramsMap === null) {
            window.showErrorMessage('not a valid parameter file');
            return;
        }

        let resource = editor.document.uri;
        let paramsFsPath = resource.fsPath;
        let defaultTemplate = getDefaultTemplateFile(paramsFsPath);
        let otherTemplates = discoverTemplateFiles(resource).then((_) => _, (_) => downloadTemplates(resource));
        askForFile(defaultTemplate, otherTemplates, 'please select a template file ...', false).then(templateFile => {
            if (templateFile === undefined) {
                return;
            }

            let column = nextColumn(editor);
            fs.exists(templateFile, exists => {
                if (!exists) {
                    mkFileDirRecursive(path.dirname(templateFile));
                    fs.writeFile(templateFile, JSON.stringify(InterfaceBuilder.getDefaultConfig(), null, 2), (err) => {
                        if (err !== null) {
                            window.showErrorMessage(`can't write to template file ${templateFile}: ${err}`);
                            return;
                        }
                    });
                    workspace.openTextDocument(templateFile).then(doc => window.showTextDocument(doc, column));
                    return;
                }

                fs.readFile(templateFile, 'utf8', (err, data) => {
                    if (err !== null) {
                        window.showErrorMessage(`can't read template file ${templateFile}`);
                        return;
                    }
                    
                    let cmd = InterfaceBuilder.build(data, paramsMap as ParamsMap);
                    if (cmd === null) {
                        window.showErrorMessage(`can't parse rule file ${templateFile}`);
                        return;
                    }
               
                    // Remember template file
                    _templateFiles.set(paramsFsPath, templateFile);
    
                    let knownCmdFiles: Thenable<string[]> = new Promise((resolve, reject) => resolve([..._cmdFiles.values()]));
                    let suggestedCmdName = _cmdFiles.get(paramsFsPath);
                    if (suggestedCmdName === undefined) {
                        let paramsPath = path.parse(editor.document.uri.fsPath);
                        let rulesPath = path.parse(templateFile);
                        suggestedCmdName = path.join(paramsPath.dir, `${paramsPath.name}.${rulesPath.name}.txt`);
                    }
    
                    askForFile(suggestedCmdName, knownCmdFiles, 'please pick an output file ...').then((cmdFile) => {
                        if (cmdFile === undefined) {
                            return;
                        }
    
                        fs.writeFile(cmdFile, cmd, 'utf8', (err) => {
                            if (err !== null) {
                                window.showErrorMessage(`can't write command file ${cmdFile}`);
                                return;
                            }
    
                            return workspace.openTextDocument(cmdFile).then(doc => {
                                if (doc === undefined) {
                                    window.showErrorMessage(`something went wrong opening ${cmdFile}`);
                                    return;
                                }
    
                                // Remember cmd file
                                _cmdFiles.set(paramsFsPath, cmdFile);
                                window.showTextDocument(doc, column);
                            });
                        });
                    });
                });
            });
        });
    });

    context.subscriptions.push(
        providerRegistrations,
        replaceParamsCmd,
        replaceParamsToFileCmd,
        generateScriptFromParamsCmd,
        downloadTemplatesCmd
    );
}

const _paramsFiles = new Map<string, string>();
const _templateFiles = new Map<string, string>();
const _cmdFiles = new Map<string, string>();

function resolvePath(p: string): string {
    return p.startsWith('~') ? path.join(homedir(), path.normalize(p.replace(/^~[\/\\]/, ''))) : path.normalize(p);
}

function getDefaultTemplateUrl(): string | undefined {
    return workspace.getConfiguration('frigg', null).get('templatesUrl');
}

function getDefaultTemplatesFolder(resource: Uri | undefined): string | undefined {
    return workspace.getConfiguration('frigg', resource).get('templatesFolder');
}

function updateTemplatesFolder(resource: Uri | undefined, value: any): Thenable<void> {
    const sectionName = 'templatesFolder';
    let config = workspace.getConfiguration('frigg', resource);
    let inspect = config.inspect(sectionName);
    let useGlobal = inspect === undefined || (inspect.workspaceFolderValue === undefined && inspect.workspaceValue === undefined);
    return config.update(sectionName, value, useGlobal);
}

function getDefaultParamsFile(params: Params): string {
    let d = _paramsFiles.get(params.original.toString());
    return d === undefined ? params.defaultParametersPath() : d;
}

function getDefaultTemplateFile(paramsFsPath: string): string | undefined {
    return _templateFiles.get(paramsFsPath);
}

function discoverTemplateFiles(resource: Uri): Thenable<string[]> {
    return new Promise((resolve, reject) => {
        let templates = Array.from(_templateFiles.values());
        let templatesFolder = getDefaultTemplatesFolder(resource);
        if (templatesFolder === undefined) {
            templates.length === 0 ? reject('template folder not set') : resolve(templates);
        } else {
            let folderPath = resolvePath(templatesFolder);
            fs.readdir(folderPath, (err, moreFiles) => {
                if (err === null && moreFiles !== undefined) {
                    let jsonFiles = moreFiles.filter(f => f.endsWith('.json'));
                    templates = templates.concat(jsonFiles.map(f => path.join(folderPath, f)));
                }
                resolve(templates);
            });
        }
    });
}

function nextColumn(editor: TextEditor): number {
    return editor.viewColumn === undefined ? 1 : Math.min(editor.viewColumn + 1, 2);
}

function setDefaultParamsFile(uri: Uri, paramsFilePath: string) {
    _paramsFiles.set(uri.toString(), paramsFilePath);
}

function downloadTemplates(resource: Uri | undefined): Thenable<string[]> {
    return new Promise((resolve, reject) => {
        let url = getDefaultTemplateUrl();
        if (url === undefined) {
            reject('no templates url set!');
            return;
        }

        // Pick template folder
        let templatesFolder = getDefaultTemplatesFolder(resource);
        let opt = {
            defaultUri: templatesFolder !== undefined ? Uri.file(templatesFolder) : undefined,
            canSelectFiles: false, 
            canSelectMany: false, 
            canSelectFolders: true 
        };

        window.showOpenDialog(opt).then(selected => {
            if (selected === undefined || selected.length < 1) {
                reject();
                return;
            }

            let selectedFolder = selected[0].fsPath;
            if (!mkFileDirRecursive(selectedFolder)) {
                reject(`can't create folder ${selectedFolder}`);
                return;
            }

            // remember new template folder
            updateTemplatesFolder(resource, selectedFolder);
            
            window.showQuickPick([url as string], { placeHolder: 'Download templates from ...' }).then(selected => {
                if (selected === undefined) {
                    reject();
                    return;
                }

                makeRequest(selected).then(content => {
                    const items = JSON.parse(content) as any[];
                    let files = items.filter(f => 'type' in f && 'name' in f && 'download_url' in f && f['type'] === 'file');
                    if (files.length === 0) {
                        reject('no template files found.');
                        return;
                    }
                    
                    let completed: string[] = [];
                    let errors = 0;
                    let complete = function() {
                        if (completed.length + errors >= files.length) {
                            window.showInformationMessage(`Done! ${files.length - errors} templates downloaded, ${errors} errors.`);
                            resolve(completed);
                        }
                    };

                    for (let i = 0; i < files.length; ++i) {
                        let f = files[i];
                        let filePath = path.join(selectedFolder, f['name']);
                        window.showInformationMessage(`downloading ${f['name']} ...`);
                        makeRequest(f['download_url']).then(body => {
                            if (body === undefined || body === null) {
                                window.showErrorMessage(`can't download ${f['name']} from: ${f['download_url']}`);
                                errors++;
                                complete();
                                return;
                            }

                            fs.writeFile(filePath, body, 'utf8', err => {
                                if (err !== null) {
                                    window.showErrorMessage(`can't write template file ${filePath}: ${err}`);
                                    complete();
                                    return;
                                }

                                completed.push(filePath);
                                complete();
                            });
                        });
                    }
                });
            }); 
        });
    });
}


function replaceParams(document: TextDocument, column: ViewColumn, readOnly: boolean = true) {
    let params = new Params(document);
    let originalUri = document.uri;
    askForFile(getDefaultParamsFile(params), params.discoverParamatersFiles(), 'select a parameter file to use / create ...').then((selected) => {
        if (selected === undefined) {
            return;
        }
        
        if (!params.tryUpdateParams(selected)) {
            window.showInformationMessage(`Generating parameter value file from ${selected}\n`+
                                          'Please add any replacement to the value file.');
            params.saveParams(selected).then(p => {
                setDefaultParamsFile(originalUri, p.fsPath);
                return workspace.openTextDocument(p);
            }).then(doc => window.showTextDocument(doc, column), err => window.showErrorMessage(err));
        } else {
            params.saveParams(selected).then(p => setDefaultParamsFile(originalUri, p.fsPath), err => window.showErrorMessage(err));
            const replacementUri = ReplacementProvider.getUri(params);

            if (readOnly) {
                workspace.openTextDocument(replacementUri).then(doc => window.showTextDocument(doc, column), err => window.showErrorMessage(err));
            } else {
                workspace.openTextDocument(replacementUri).then(replaced => {
                    if (replaced === undefined || replaced === null) {
                        window.showErrorMessage('error replacing document!');
                        return;
                    }

                    askForFile(replaced.uri.fsPath, null, 'save replaced file to ...').then(selected => {
                        if (selected === undefined || selected === null) {
                            return;
                        }

                        return fs.writeFile(selected, replaced.getText(), 'utf8', (err) => {
                            if (err !== null) {
                                window.showErrorMessage(`Error writing ${selected}: ${err}`);
                            } else {
                                window.showTextDocument(Uri.file(selected));
                            }
                        });}, 
                        err => window.showErrorMessage(err));
                    });
            }
        }
    });
}

function askForFile(defaultFile: string | undefined,
                    files: Thenable<string[] | undefined> | null,
                    placeHolder: string,
                    overWritePick: boolean = true): Thenable<string|undefined> {
    
    let qpo: QuickPickOptions = {
        placeHolder: placeHolder,
        matchOnDescription: true,
    };
    
    let shouldOpenDialog = 'pick a file ...';
    let options: Thenable<string[]> | string[];
    if (files === null) {
        options = defaultFile === undefined ? [shouldOpenDialog] : [defaultFile, shouldOpenDialog];
    } else {
        options = files.then((files) => {
            files = (files === undefined ? [] : files).filter(f => f !== defaultFile).concat([shouldOpenDialog]);
            return defaultFile === undefined ? files : [defaultFile].concat(files);
        });
    }

    return window.showQuickPick(options, qpo).then(selected => {
        if (selected && selected !== undefined) {
            if (selected === shouldOpenDialog) {
                let dialogOptions = { 
                    defaultUri: defaultFile !== undefined ? Uri.file(defaultFile) : undefined,
                    canSelectFiles: false,
                    canSelectFolders: false,
                    canSelectMany: false
                };

                if (overWritePick) {
                    return window.showSaveDialog(dialogOptions).then(selectedUri => {
                        if (selectedUri !== undefined) {
                            return selectedUri.fsPath;
                        }
                    });
                } else {
                    return window.showOpenDialog(dialogOptions).then(selectedUris => {
                        if (selectedUris !== undefined && selectedUris.length === 1) {
                            return selectedUris[0].fsPath;
                        }
                    });
                }
            } else {
                return new Promise((resolve, reject) => resolve(selected));
            }
        }
        return new Promise((resolve, reject) => reject());
    });
}

function makeRequest(url: string): Thenable<string> {
    return new Promise((resolve, reject) => {
        let ro = {
            url: url,
            headers: {
                'User-Agent': 'vscode-frigg'
            }
        };

        request(ro, (error: any | null, response: any|null, body: any|null) => {
            if (error !== null) {
                window.showErrorMessage(`error fetching "${ro.url}": ${error}`);
                reject(error);
            } else if (response === null || response.statusCode !== 200) {
                window.showErrorMessage(`wrong response for "${ro.url}": ${response.statusCode}\n${JSON.stringify(response)}`);
                reject(response);
            } else {
                resolve(body);
            }
        });
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
    _paramsFiles.clear();
    _templateFiles.clear();
    _cmdFiles.clear();
}
