const { validateHedDatasetWithContext } = require('../dataset')
const { validateHedString } = require('../event')
const { BidsDataset, BidsHedIssue, BidsIssue } = require('./types')
const { buildBidsSchemas } = require('./schema')

/**
 * Validate a BIDS dataset.
 *
 * @param {BidsDataset} dataset The BIDS dataset.
 * @param {object} schemaDefinition The version spec for the schema to be loaded.
 * @return {Promise<BidsIssue[]>} Any issues found.
 */
function validateBidsDataset(dataset, schemaDefinition) {
  return buildBidsSchemas(dataset, schemaDefinition).then(
    ([hedSchemas, schemaLoadIssues]) => {
      return validateFullDataset(dataset, hedSchemas)
        .catch(BidsIssue.generateInternalErrorPromise)
        .then((issues) =>
          issues.concat(convertHedIssuesToBidsIssues(schemaLoadIssues, dataset.datasetDescription.file)),
        )
    },
    (issues) => convertHedIssuesToBidsIssues(issues, dataset.datasetDescription.file),
  )
}

function validateFullDataset(dataset, hedSchemas) {
  try {
    const [sidecarErrorsFound, sidecarIssues] = validateSidecars(dataset.sidecarData, hedSchemas)
    const [hedColumnErrorsFound, hedColumnIssues] = validateHedColumn(dataset.eventData, hedSchemas)
    if (sidecarErrorsFound || hedColumnErrorsFound) {
      return Promise.resolve([].concat(sidecarIssues, hedColumnIssues))
    }
    const eventFileIssues = dataset.eventData.map((eventFileData) => {
      return validateBidsEventFile(eventFileData, hedSchemas)
    })
    return Promise.resolve([].concat(sidecarIssues, hedColumnIssues, ...eventFileIssues))
  } catch (e) {
    return Promise.reject(e)
  }
}

function validateBidsEventFile(eventFileData, hedSchemas) {
  // get the json sidecar dictionary associated with the event data

  const [hedStrings, tsvIssues] = parseTsvHed(eventFileData)
  if (!hedStrings) {
    return []
  } else {
    const datasetIssues = validateCombinedDataset(hedStrings, hedSchemas, eventFileData)
    return [].concat(tsvIssues, datasetIssues)
  }
}

function validateSidecars(sidecarData, hedSchema) {
  const issues = []
  let sidecarErrorsFound = false
  // validate the HED strings in the json sidecars
  for (const sidecar of sidecarData) {
    const valueStringIssues = validateStrings(sidecar.hedValueStrings, hedSchema, sidecar.file, true)
    const categoricalStringIssues = validateStrings(sidecar.hedCategoricalStrings, hedSchema, sidecar.file, false)
    const fileIssues = [].concat(valueStringIssues, categoricalStringIssues)
    sidecarErrorsFound =
      sidecarErrorsFound ||
      fileIssues.some((fileIssue) => {
        return fileIssue.isError()
      })
    issues.push(...fileIssues)
  }
  return [sidecarErrorsFound, issues]
}

function validateHedColumn(eventData, hedSchemas) {
  const issues = eventData.flatMap((eventFileData) => {
    return validateStrings(eventFileData.hedColumnHedStrings, hedSchemas, eventFileData.file, false)
  })
  const errorsFound = issues.some((issue) => {
    return issue.isError()
  })
  return [errorsFound, issues]
}

function parseTsvHed(eventFileData) {
  const hedStrings = []
  const issues = []
  const sidecarHedColumnIndices = {}
  for (const sidecarHedColumn of eventFileData.sidecarHedData.keys()) {
    const sidecarHedColumnHeader = eventFileData.parsedTsv.headers.indexOf(sidecarHedColumn)
    if (sidecarHedColumnHeader > -1) {
      sidecarHedColumnIndices[sidecarHedColumn] = sidecarHedColumnHeader
    }
  }
  if (eventFileData.hedColumnHedStrings.length + sidecarHedColumnIndices.length === 0) {
    return [[], []]
  }

  eventFileData.parsedTsv.rows.slice(1).forEach((rowCells, rowIndex) => {
    // get the 'HED' field
    const hedStringParts = []
    if (eventFileData.hedColumnHedStrings[rowIndex]) {
      hedStringParts.push(eventFileData.hedColumnHedStrings[rowIndex])
    }
    for (const sidecarHedColumn of Object.keys(sidecarHedColumnIndices)) {
      const sidecarHedIndex = sidecarHedColumnIndices[sidecarHedColumn]
      const sidecarHedData = eventFileData.sidecarHedData.get(sidecarHedColumn)
      const rowCell = rowCells[sidecarHedIndex]
      if (rowCell && rowCell !== 'n/a') {
        let sidecarHedString
        if (!sidecarHedData) {
          continue
        }
        if (typeof sidecarHedData === 'string') {
          sidecarHedString = sidecarHedData.replace('#', rowCell)
        } else {
          sidecarHedString = sidecarHedData[rowCell]
        }
        if (sidecarHedString !== undefined) {
          hedStringParts.push(sidecarHedString)
        } else {
          issues.push(new BidsIssue(108, eventFileData.file, rowCell))
        }
      }
    }

    if (hedStringParts.length > 0) {
      hedStrings.push(hedStringParts.join(','))
    }
  })

  return [hedStrings, issues]
}

function validateCombinedDataset(hedStrings, hedSchema, eventFileData) {
  const [isHedDatasetValid, hedIssues] = validateHedDatasetWithContext(
    hedStrings,
    eventFileData.mergedSidecar.hedStrings,
    hedSchema,
    true,
  )
  if (!isHedDatasetValid) {
    return convertHedIssuesToBidsIssues(hedIssues, eventFileData.file)
  } else {
    return []
  }
}

function validateStrings(hedStrings, hedSchema, fileObject, areValueStrings = false) {
  const issues = []
  for (const hedString of hedStrings) {
    if (!hedString) {
      continue
    }
    const [isHedStringValid, hedIssues] = validateHedString(hedString, hedSchema, true, areValueStrings)
    if (!isHedStringValid) {
      const convertedIssues = convertHedIssuesToBidsIssues(hedIssues, fileObject)
      issues.push(...convertedIssues)
    }
  }
  return issues
}

function convertHedIssuesToBidsIssues(hedIssues, file) {
  return hedIssues.map((hedIssue) => new BidsHedIssue(hedIssue, file))
}

module.exports = { validateBidsDataset }
