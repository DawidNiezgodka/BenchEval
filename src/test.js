import { getInput } from '@actions/core'
const {
  returnNthPreviousBenchmark,
  checkIfNthPreviousBenchmarkExists
} = require('./evaluate')
const { EvaluationConfig } = require('./types')

module.exports.camelToSnake = function (string) {
  return string
    .replace(/\w([A-Z])/g, function (m) {
      return m[0] + '_' + m[1]
    })
    .toLowerCase()
}

module.exports.createEvaluationConfig = function (...inputNames) {
  const validInputs = [
    'evaluationMethod',
    'thresholdValues',
    'comparisonOperators',
    'comparisonMargins',
    'thresholdUpper',
    'thresholdLower',
    'jumpDetectionThreshold',
    'movingAveWindowSize',
    'movingAveThreshold',
    'deltasThreshold'
  ]

  const configValues = validInputs.map(inputName => {
    if (inputNames.includes(inputName)) {
      const snakeCaseInputName = module.exports.camelToSnake(inputName)
      const inputValue = getInput(snakeCaseInputName)

      if (inputValue) {
        return inputValue.includes(',')
          ? inputValue.split(',').map(Number)
          : Number(inputValue)
      }
    }
    return null
  })

  return new EvaluationConfig(...configValues)
}

module.exports.validateAndFetchConfig = function (currentResultLength) {
  const evaluationMethod = getInput('evaluation_method', { required: true })
  const validEvaluationMethods = [
    'threshold',
    'previous',
    'previous_successful',
    'threshold_range',
    'jump_detection',
    'trend_detection_moving_ave',
    'trend_detection_deltas'
  ]
  if (!validEvaluationMethods.includes(evaluationMethod)) {
    throw new Error(
      `Invalid evaluation method: ${evaluationMethod}. Must be one of ${validEvaluationMethods.join(
        ', '
      )}`
    )
  }

  switch (evaluationMethod) {
    case 'threshold':
      module.exports.validateOperatorsAndMargins(currentResultLength)
      module.exports.validateThresholdConfig(currentResultLength)
      break
    case 'previous':
      module.exports.validateOperatorsAndMargins(currentResultLength)

      break
    case 'previous_successful':
      module.exports.validateOperatorsAndMargins(currentResultLength)

      break
    case 'threshold_range':
      module.exports.validateThresholdRangeConfig(currentResultLength)
      break
    case 'jump_detection':
      module.exports.validateJumpDetectionConfig()
      break
    case 'trend_detection_moving_ave':
      module.exports.validateTrendDetectionMovingAveConfig()
      const movingAveWindowSize = getInput('moving_ave_window')

      break
    case 'trend_detection_deltas':
      break
    default:
      throw new Error(
        `Unsupported evaluation method: ${config.evaluationMethod}`
      )
  }

  return module.exports.createEvaluationConfig(
    'evaluationMethod',
    'thresholdValues',
    'comparisonOperators',
    'comparisonMargins',
    'thresholdUpper',
    'thresholdLower',
    'jumpDetectionThreshold',
    'movingAveWindowSize',
    'movingAveThreshold',
    'deltasThreshold'
  )
}

module.exports.validateOperatorsAndMargins = function (currentResultLength) {
  const comparisonOperatorsInput = getInput('comparisonOperators')
  const comparisonMarginsInput = getInput('comparisonMargins')

  if (!comparisonOperatorsInput || !comparisonMarginsInput) {
    throw new Error('Comparison operators and margins must not be null.')
  }

  const comparisonOperators = comparisonOperatorsInput.split(',')
  const comparisonMargins = comparisonMarginsInput.split(',').map(Number)

  if (comparisonOperators.length !== currentResultLength) {
    throw new Error(
      `The number of comparison operators must be equal to ${currentResultLength}.`
    )
  }
  if (comparisonMargins.length !== currentResultLength) {
    throw new Error(
      `The number of comparison margins must be equal to ${currentResultLength}.`
    )
  }

  const validOperators = ['smaller', 'bigger', 'tolerance']
  comparisonOperators.forEach(operator => {
    if (!validOperators.includes(operator.trim())) {
      throw new Error(
        `Invalid comparison operator: ${operator}. Valid operators are: ${validOperators.join(
          ', '
        )}.`
      )
    }
  })

  const validMargins = comparisonMargins.every(
    margin => margin === -1 || (margin >= 0 && margin <= 100)
  )
  if (!validMargins) {
    throw new Error('Comparison margins must be in the range [-1, 100].')
  }
}
module.exports.validateThresholdConfig = function (currentResultLength) {
  const thresholdValuesInput = getInput('threshold_values')
  const thresholdValues = thresholdValuesInput
    .split(',')
    .map(value => value.trim())

  if (thresholdValues.length !== currentResultLength) {
    throw new Error(
      `The number of threshold values (${thresholdValues.length}) must match the number of metrics (${currentResultLength}).`
    )
  }
}
module.exports.validateThresholdRangeConfig = function (currentResultLength) {
  const thresholdUpperInput = getInput('threshold_upper')
  const thresholdLowerInput = getInput('threshold_lower')

  if (!thresholdUpperInput || !thresholdLowerInput) {
    throw new Error(
      'Threshold range values are required for the threshold_range evaluation method.'
    )
  }

  const thresholdUpper = thresholdUpperInput.split(',').map(Number)
  const thresholdLower = thresholdLowerInput.split(',').map(Number)

  if (thresholdUpper.length !== thresholdLower.length) {
    throw new Error(
      'The number of upper thresholds must match the number of lower thresholds.'
    )
  }

  if (thresholdUpper.length !== currentResultLength) {
    throw new Error(
      'The number of thresholds must match the number of results.'
    )
  }
}

module.exports.validateJumpDetectionConfig = function (currentResultLength) {
  const jumpDetectionThresholdInput = core.getInput('jump_detection_threshold')

  if (jumpDetectionThresholdInput.trim() === '') {
    throw new Error('Jump detection threshold must be provided.')
  }

  const jumpDetectionThreshold = Number(jumpDetectionThresholdInput.trim())

  if (isNaN(jumpDetectionThreshold)) {
    throw new Error('Jump detection threshold must be a valid number.')
  }

  if (jumpDetectionThreshold < 0 || jumpDetectionThreshold > 100) {
    throw new Error(
      'Jump detection threshold must be within the range [0, 100].'
    )
  }

  return jumpDetectionThreshold
}

module.exports.validateTrendDetectionMovingAveConfig = function () {
  const movingAveWindowSize = getInput('moving_ave_window_size')
  const movingAveThreshold = getInput('moving_ave_threshold')

  if (movingAveWindowSize == null || movingAveThreshold == null) {
    throw new Error(
      'Both movingAveWindowSize and movingAveThreshold must be provided for trend detection with moving average.'
    )
  }

  if (!checkIfNthPreviousBenchmarkExists(benchmarkData, movingAveWindowSize)) {
    throw new Error(
      `The provided movingAveWindowSize of ${movingAveWindowSize} exceeds the number of available benchmarks.`
    )
  }

  const movingAveThresholdValue = Number(movingAveThreshold)
  if (
    isNaN(movingAveThresholdValue) ||
    movingAveThresholdValue < 0 ||
    movingAveThresholdValue > 100
  ) {
    throw new Error('movingAveThreshold must be a number between 0 and 100.')
  }
}
