'use strict';

import {workspace, window, commands, ExtensionContext, Disposable} from 'vscode';
import Params from './params';
import ReplacementProvider from './replacementProvider';

export function activate(context: ExtensionContext) {

    const replacementProvider = new ReplacementProvider();

    const providerRegistrations = Disposable.from(
        workspace.registerTextDocumentContentProvider(ReplacementProvider.scheme, replacementProvider)
    );

    const replaceAEtherParams = commands.registerTextEditorCommand('extension.replaceParameters', editor => {
        let uri = editor.document.uri;
        var params = new Params(editor.document);
        if (!params.tryUpdateParams())
        {
            window.showInformationMessage(`Generating parameter value file from ${uri.fsPath}\nPlease add any replacement to the value file.`);
            return workspace.openTextDocument(params.saveParams()).then(doc => window.showTextDocument(doc));
        }
        
        params.saveParams();
        const replacementUri = ReplacementProvider.getUri(uri, params.getParams());
        return workspace.openTextDocument(replacementUri).then(doc => window.showTextDocument(doc));
    });

    context.subscriptions.push(
        providerRegistrations,
        replaceAEtherParams,
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
}