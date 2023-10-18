const core = require('@actions/core')
const fs = require('fs')
const { Config } = require('./types')

module.exports.validateBooleanInput = function (input) {
  return input === 'true' || input === 'false'
}

module.exports.validateBenchType = function (benchmarkType) {
  const validTypes = ['simple', 'simple-multi', 'complex', 'complex-multi']
  if (!validTypes.includes(benchmarkType)) {
    throw new Error(`Invalid benchmark type: ${benchmarkType}`)
  }
}

module.exports.validateReference = function (
  reference,
  currentBenchName,
  benchToCompare
) {
  const validReferences = ['previous', 'threshold', 'previous-successful']

  if (currentBenchName !== benchToCompare) {
    const validReferences = ['previous', 'previous-successful']
    if (!validReferences.includes(reference)) {
      throw new Error(`Invalid reference: ${reference}`)
    }
  }

  if (!validReferences.includes(reference)) {
    throw new Error(`Invalid reference: ${reference}`)
  }
}

module.exports.determineJsonItemCount = function (json) {
  if (Array.isArray(json)) {
    return json.length
  }

  if (json && typeof json === 'object') {
    return 1
  }

  throw new Error(`Invalid JSON: ${json}`)
}

module.exports.validateItemCountForBenchType = function (itemCount, benchType) {
  if (benchType === 'simple' || benchType === 'complex') {
    return itemCount === 1
  } else if (benchType === 'simple-multi' || benchType === 'complex-multi') {
    return itemCount > 1
  } else {
    throw new Error(`Invalid benchType: ${benchType}`)
  }
}

module.exports.getCommaSepInputAsArray = function (inputString) {
  inputString = inputString.trim()
  if (inputString.includes(',')) {
    const array = inputString.split(',').map(str => str.trim())
    return array.filter(str => str !== '')
  } else {
    return [inputString]
  }
}

module.exports.getBoolInput = function (inputName) {
  const input = core.getInput(inputName)
  if (!input) {
    return false
  }
  if (input !== 'true' && input !== 'false') {
    throw new Error(
      `'${inputName}' input must be boolean value 'true' or 'false' but got '${input}'`
    )
  }
  return input === 'true'
}

module.exports.convertSingleJsonObjectToArr = function (obj) {
  return [obj]
}

module.exports.validateInputAndFetchConfig = function () {
  const benchName = core.getInput('name')

  const pathToCurBenchFile = core.getInput('current_bench_res_file')
  const rawData = fs.readFileSync(pathToCurBenchFile)
  const parsedData = JSON.parse(rawData)
  const itemCount = module.exports.determineJsonItemCount(parsedData.results)
  const benchType = core.getInput('bench_type')
  module.exports.validateBenchType(benchType)
  module.exports.validateItemCountForBenchType(itemCount, benchType)

  const folderWithBenchData = core.getInput('folder_with_bench_data')
  const fileWithBenchData = core.getInput('file_with_bench_data')
  const githubToken = core.getInput('github_token')

  const addComment = module.exports.getBoolInput('add_comment_to_commit')
  const addJobSummary = module.exports.getBoolInput('add_action_job_summary')
  const saveCurrBenchRes = module.exports.getBoolInput('save_curr_bench_res')
  const failingCondition = module.exports.getBoolInput('failing_condition')

  let benchToCompare = core.getInput('bench_to_compare')
  if (benchToCompare === '' || benchToCompare === null) {
    benchToCompare = benchName
  }
  const reference = core.getInput('reference')
  module.exports.validateReference(reference, benchToCompare, benchName)

  const thresholds = core.getInput('thresholds')
  let thresholdArray = []
  // if thresholds is empty or null and reference is 'threshold', throw error
  if (thresholds === '' || thresholds === null) {
    if (reference === 'threshold') {
      throw new Error(
        `Thresholds must be specified when reference is 'threshold'`
      )
    }
    if (reference === 'threshold') {
      thresholdArray = module.exports.getCommaSepInputAsArray(thresholds)
      if (itemCount !== thresholdArray.length) {
        throw new Error(
          `Number of thresholds (${thresholdArray.length}) must be equal to number of items in JSON (${itemCount})`
        )
      }
    }

    const comparisonModesInput = core.getInput('comparison_modes')
    const comparisonModes =
      module.exports.getCommaSepInputAsArray(comparisonModesInput)
    if (itemCount !== comparisonModes.length) {
      throw new Error(`Number of threshold comparison modes (${comparisonModes.length})
         must be equal to number of items in JSON (${itemCount})`)
    }

    const comparisonMarginsInput = core.getInput('comparison_margins')
    const comparisonMargins = module.exports.getCommaSepInputAsArray(
      comparisonMarginsInput
    )
    if (itemCount !== comparisonMargins.length) {
      throw new Error(`Number of percentage threshold margins (${comparisonMargins.length})
         must be equal to number of items in JSON (${itemCount})`)
    }

    return new Config(
      benchName,
      parsedData,
      benchType,
      folderWithBenchData,
      fileWithBenchData,
      githubToken,
      addComment,
      addJobSummary,
      saveCurrBenchRes,
      reference,
      benchToCompare,
      thresholdArray,
      comparisonModes,
      comparisonMargins,
      failingCondition
    )
  }
}
