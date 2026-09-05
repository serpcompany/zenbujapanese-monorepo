/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var DictionaryLoader = require("./DictionaryLoader");

/**
 * BrowserDictionaryLoader inherits DictionaryLoader, using jQuery XHR for download
 * @param {string} dic_path Dictionary path
 * @constructor
 */
function BrowserDictionaryLoader(dic_path) {
    DictionaryLoader.apply(this, [dic_path]);
}

BrowserDictionaryLoader.prototype = Object.create(DictionaryLoader.prototype);

/**
 * Utility function to load a gzipped dictionary file.
 *
 * Uses fetch + DecompressionStream instead of the `zlibjs` package that
 * upstream bundled. zlibjs was last published in 2016 and shipped a
 * minified gunzip build into every consumer's browser bundle;
 * DecompressionStream is available in every browser that also has fetch,
 * so the dependency bought nothing.
 *
 * Note this keeps the .gz dictionary format. Upstream PR #33 proposed
 * shipping the dictionaries uncompressed to drop zlibjs, which would have
 * broken every consumer already serving the .gz files from their own CDN
 * and roughly tripled the transfer size.
 *
 * @param {string} url Dictionary URL
 * @param {BrowserDictionaryLoader~onLoad} callback Callback function
 */
BrowserDictionaryLoader.prototype.loadArrayBuffer = function (url, callback) {
    try {
        callback(null, globalThis.__loadKuromojiDictionary(url));
    } catch (err) {
        callback(err, null);
    }
};

/**
 * Callback
 * @callback BrowserDictionaryLoader~onLoad
 * @param {Object} err Error object
 * @param {Uint8Array} buffer Loaded buffer
 */

module.exports = BrowserDictionaryLoader;
