const core = require('@actions/core')
const { promises: fs } = require('fs')
const fss = require('fs')
const path = require('path')
const {
  CompleteBenchmark,
  SimpleMetricResult,
  Commit,
  BenchmarkInfo
} = require('./types')

module.exports.addCompleteBenchmarkToFile = async (
  benchmarkInstance,
  currentDataFileName
) => {
  try {
    let jsonData
    const pathToPreviousDataFile = path.join(
      'benchmark_data',
      currentDataFileName
    )
    core.debug(`Reading file at ${pathToPreviousDataFile}`)
    try {
      const data = await fs.readFile(pathToPreviousDataFile, 'utf8')
      core.debug('Read file: ' + data)
      jsonData = JSON.parse(data)
    } catch (err) {
      core.debug(
        `Could not find file at ${pathToPreviousDataFile}. Initializing with default data.`
      )
      jsonData = {
        lastUpdate: Date.now(),
        repoUrl: '',
        entries: {}
      }
    }

    jsonData.lastUpdate = Date.now()

    const newBenchmarkJSON = {
      commit: benchmarkInstance.commitInfo,
      date: Date.now(),
      executionTime: benchmarkInstance.benchmarkInfo.executionTime,
      parametrization: benchmarkInstance.benchmarkInfo.parametrization,
      otherInfo: benchmarkInstance.benchmarkInfo.otherInfo,
      metrics: benchmarkInstance.simpleMetricResults.map(metric => ({
        name: metric.name,
        value: metric.value,
        unit: metric.unit
      }))
    }

    if (!jsonData.entries[benchmarkInstance.benchmarkName]) {
      jsonData.entries[benchmarkInstance.benchmarkName] = []
    }
    jsonData.entries[benchmarkInstance.benchmarkName].push(newBenchmarkJSON)

    const pth = path.join('benchmark_data', currentDataFileName)
    await fs.writeFile(pth, JSON.stringify(jsonData, null, 4), 'utf8')

    core.debug('Successfully added new benchmark to file')
  } catch (err) {
    console.error('An error occurred:', err)
  }
}

module.exports.getLatestBenchmark = async (
  benchmarkName,
  folderWithBenchData,
  fileNameWithBenchData
) => {
  const filePath = path.join(folderWithBenchData, fileNameWithBenchData)

  try {
    const fileText = fss.readFileSync(filePath, 'utf8')

    const benchmarkData = JSON.parse(fileText)

    if (!benchmarkData || Object.keys(benchmarkData).length === 0) {
      console.error('BENCHMARK_DATA is empty')
      return null
    }

    if (!benchmarkData.entries.hasOwnProperty(benchmarkName)) {
      console.error(
        'No data available for the given benchmark name:',
        benchmarkName
      )
      return null
    }

    const latestBenchmarkData = benchmarkData.entries[benchmarkName].sort(
      (a, b) => b.date - a.date
    )[0]

    const exeTime = latestBenchmarkData.benchmarkInfo.executionTime
    const parametrization = latestBenchmarkData.benchmarkInfo.parametrization
    const otherInfo = latestBenchmarkData.benchmarkInfo.otherInfo
    const benchmarkInfo = new BenchmarkInfo(exeTime, parametrization, otherInfo)

    const simpleMetricResults = latestBenchmarkData.metrics.map(
      metric => new SimpleMetricResult(metric.name, metric.value, metric.unit)
    )

    const commitInfo = new Commit(
      latestBenchmarkData.commit.author,
      latestBenchmarkData.commit.committer,
      latestBenchmarkData.commit.id,
      latestBenchmarkData.commit.message,
      latestBenchmarkData.commit.timestamp,
      latestBenchmarkData.commit.url
    )

    return new CompleteBenchmark(
      benchmarkName,
      benchmarkInfo,
      simpleMetricResults,
      commitInfo
    )
  } catch (error) {
    console.error('An error occurred:', error)
    return null
  }
}
