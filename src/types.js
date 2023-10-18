class CompleteBenchmark {
  constructor(
    benchmarkName,
    benchmarkInfo,
    simpleMetricResults,
    commitInfo,
    benchSuccessful
  ) {
    this.benchmarkName = benchmarkName
    this.benchmarkInfo = benchmarkInfo
    this.simpleMetricResults = simpleMetricResults
    this.commitInfo = commitInfo
    this.benchSuccessful = benchSuccessful
  }
}

class BenchmarkInfo {
  constructor(executionTime, parametrization, otherInfo) {
    this.executionTime = executionTime
    this.parametrization = parametrization
    this.otherInfo = otherInfo
  }
}

class SimpleMetricResult {
  constructor(name, value, unit) {
    this.name = name
    this.value = value
    this.unit = unit
  }
}

class Commit {
  constructor(author, committer, id, message, timestamp, url) {
    this.author = author
    this.committer = committer
    this.id = id
    this.message = message
    this.timestamp = timestamp
    this.url = url
  }
}

class Config {
  constructor(
    benchName,
    currBenchResJson,
    benchType,
    folderWithBenchData,
    fileWithBenchData,
    githubToken,
    addComment,
    addJobSummary,
    saveCurrBenchRes,
    reference,
    benchToCompare,
    thresholds,
    comparisonModes,
    comparisonMargins,
    failingCondition
  ) {
    this.benchName = benchName
    this.currBenchResJson = currBenchResJson
    this.benchType = benchType
    this.folderWithBenchData = folderWithBenchData
    this.fileWithBenchData = fileWithBenchData
    this.githubToken = githubToken
    this.addComment = addComment
    this.addJobSummary = addJobSummary
    this.saveCurrBenchRes = saveCurrBenchRes
    this.reference = reference
    this.thresholds = thresholds
    this.benchToCompare = benchToCompare
    this.comparisonModes = comparisonModes
    this.comparisonMargins = comparisonMargins
    this.failingCondition = failingCondition
  }
}

module.exports = {
  CompleteBenchmark,
  SimpleMetricResult,
  Config,
  Commit,
  BenchmarkInfo
}
