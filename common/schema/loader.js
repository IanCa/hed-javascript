/** HED schema loading functions. */

/* Imports */

const xml2js = require('xml2js')

const files = require('../../utils/files')
const { stringTemplate } = require('../../utils/string')

const { fallbackFilePath } = require('./config')

/**
 * Load schema XML data from a schema version or path description.
 *
 * @param {SchemaSpec} schemaDef The description of which schema to use.
 * @param {boolean} useFallback Whether to use a bundled fallback schema if the requested schema cannot be loaded.
 * @return {Promise<never>|Promise<object>} The schema XML data or an error.
 */
const loadSchema = function (schemaDef = null, useFallback = true) {
  let schemaPromise
  if (schemaDef === null) {
    schemaPromise = loadRemoteBaseSchema('Latest')
  } else if (schemaDef.path) {
    schemaPromise = loadLocalSchema(schemaDef.path)
  } else if (schemaDef.library) {
    schemaPromise = loadRemoteLibrarySchema(schemaDef.library, schemaDef.version)
  } else if (schemaDef.version) {
    schemaPromise = loadRemoteBaseSchema(schemaDef.version)
  } else {
    return Promise.reject(new Error('Invalid schema definition format.'))
  }
  return schemaPromise.catch((error) => {
    if (useFallback) {
      return loadLocalSchema(fallbackFilePath)
    } else {
      throw error
    }
  })
}

/**
 * Load base schema XML data from the HED specification GitHub repository.
 *
 * @param {string} version The base schema version to load.
 * @return {Promise<object>} The schema XML data.
 */
const loadRemoteBaseSchema = function (version = 'Latest') {
  const url = `https://raw.githubusercontent.com/hed-standard/hed-specification/master/hedxml/HED${version}.xml`
  return loadSchemaFile(
    files.readHTTPSFile(url),
    stringTemplate`Could not load HED base schema, version "${1}", from remote repository - "${0}".`,
    ...arguments,
  )
}

/**
 * Load library schema XML data from the HED specification GitHub repository.
 *
 * @param {string} library The library schema to load.
 * @param {string} version The schema version to load.
 * @return {Promise<object>} The library schema XML data.
 */
const loadRemoteLibrarySchema = function (library, version = 'Latest') {
  const url = `https://raw.githubusercontent.com/hed-standard/hed-schema-library/main/library_schemas/${library}/hedxml/HED_${library}_${version}.xml`
  return loadSchemaFile(
    files.readHTTPSFile(url),
    stringTemplate`Could not load HED library schema ${1}, version "${2}", from remote repository - "${0}".`,
    ...arguments,
  )
}

/**
 * Load schema XML data from a local file.
 *
 * @param {string} path The path to the schema XML data.
 * @return {Promise<object>} The schema XML data.
 */
const loadLocalSchema = function (path) {
  return loadSchemaFile(
    files.readFile(path),
    stringTemplate`Could not load HED schema from path "${1}" - "${0}".`,
    ...arguments,
  )
}

/**
 * Actually load the schema XML file.
 *
 * @param {Promise<string>} xmlDataPromise The Promise containing the unparsed XML data.
 * @param {function(...[*]): string} errorMessage A tagged template literal containing the error message.
 * @param {Array} errorArgs The error arguments passed from the calling function.
 * @return {Promise<object>} The parsed schema XML data.
 */
const loadSchemaFile = function (xmlDataPromise, errorMessage, ...errorArgs) {
  return xmlDataPromise.then(parseSchemaXML).catch((error) => {
    throw new Error(errorMessage(error, ...errorArgs))
  })
}

/**
 * Parse the schema XML data.
 *
 * @param {string} data The XML data.
 * @return {Promise<object>} The schema XML data.
 */
const parseSchemaXML = function (data) {
  return xml2js.parseStringPromise(data, { explicitCharkey: true })
}

module.exports = loadSchema
