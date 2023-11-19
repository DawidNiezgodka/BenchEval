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
  currentDataFileName,
  evaluationResult,
  evaluationParams,
  evaluationConfig
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
      //core.debug('Read file: ' + data) // -> can be very long...
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
      })),
      benchSuccessful: benchmarkInstance.benchSuccessful,
      evaluation: {
        evaluationConfig: evaluationConfig,
        evaluationParams: evaluationParams,
        evaluationResult: evaluationResult
      }

    }

    console.log('Benchmark name: ' + benchmarkInstance.benchmarkName)
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

module.exports.getLatestBenchmark = function (
  benchmarkName,
  folderWithBenchData,
  fileNameWithBenchData,
  n,
  successful = false
)  {

  const sortedBenchmarkData = module.exports.getSortedBenchmarkData(
      folderWithBenchData, fileNameWithBenchData, benchmarkName, n, successful
  )

    const nthLatestBenchmarkData = sortedBenchmarkData[n - 1]
    core.debug(`nthLatestBenchmarkData.metrics ${JSON.stringify(nthLatestBenchmarkData)}`)
    return convertBenchDataToCompleteBenchmarkInstance(nthLatestBenchmarkData, benchmarkName)

}

module.exports.getCompleteBenchData = function (
    folderWithBenchData,
    fileNameWithBenchData
)  {
  const filePath = path.join(folderWithBenchData, fileNameWithBenchData)

  try {
    const fileText = fss.readFileSync(filePath, 'utf8')

    const benchmarkData = JSON.parse(fileText)

    if (!benchmarkData || Object.keys(benchmarkData).length === 0) {
      console.error('BENCHMARK_DATA is empty')
      return null
    }

    return benchmarkData;
  } catch (error) {
      console.error('An error occurred:', error)
      return null
    }
}

function convertBenchDataToCompleteBenchmarkInstance(data, benchmarkName) {
  const exeTime = data.executionTime;
  const parametrization = data.parametrization;
  const otherInfo = data.otherInfo;
  const benchmarkInfo = new BenchmarkInfo(exeTime, parametrization, otherInfo);
  const benchSuccessful = data.benchSuccessful;

  const simpleMetricResults = data.metrics.map(
      metric => new SimpleMetricResult(metric.name, metric.value, metric.unit)
  );

  const commitInfo = new Commit(
      data.commit.author,
      data.commit.committer,
      data.commit.id,
      data.commit.message,
      data.commit.timestamp,
      data.commit.url
  );

  return new CompleteBenchmark(
      benchmarkName,
      benchmarkInfo,
      simpleMetricResults,
      commitInfo,
      benchSuccessful
  );
}

module.exports.getNLatestBenchmarks = function (
    benchmarkName,
    folderWithBenchData,
    fileNameWithBenchData,
    n,
    successful = false
) {
  try {
    const sortedBenchmarkData = module.exports.getSortedBenchmarkData(
        folderWithBenchData, fileNameWithBenchData, benchmarkName, n, successful
    )

    return sortedBenchmarkData.slice(0, n).map(data => {
      return convertBenchDataToCompleteBenchmarkInstance(data, benchmarkName);
    });
  } catch (error) {
    console.error('An error occurred:', error);
    return null;
  }
}

module.exports.getSortedBenchmarkData = function (folderWithBenchData, fileNameWithBenchData,
                                                  benchmarkName, n, successful = false) {

  try {
    const benchmarkData = module.exports.getCompleteBenchData(
        folderWithBenchData, fileNameWithBenchData
    );
    if (!benchmarkData.entries.hasOwnProperty(benchmarkName)) {
      console.error(
          'No data available for the given benchmark name:',
          benchmarkName
      );
      return null;
    }

    let sortedBenchmarkData = benchmarkData.entries[benchmarkName].sort(
        (a, b) => b.date - a.date
    );

    if (successful) {
      sortedBenchmarkData = sortedBenchmarkData.filter(entry => entry.benchSuccessful);
    }

    if (sortedBenchmarkData.length < n) {
      console.error(`Less than ${n} ${successful ? 'successful ' : ''}benchmarks available`);
      return null;
    }

    return sortedBenchmarkData;
  } catch (error) {
    console.error('An error occurred:', error);
    return null;
  }
}

module.exports.getBenchFromWeekAgo = function (benchToCompare, folderWithBenchData, fileNameWithBenchData) {

  // print input parameters
    console.log(`benchToCompare: ${benchToCompare}`);
    console.log(`folderWithBenchData: ${folderWithBenchData}`);
    console.log(`fileNameWithBenchData: ${fileNameWithBenchData}`);
  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let data = module.exports.getCompleteBenchData(
      folderWithBenchData, fileNameWithBenchData
  );

  let benchmarks = data.entries[benchToCompare];
  // Print the amount of benchmarks
    console.log(`Number of benchmarks under '${benchToCompare}': ${benchmarks.length}`);
  let closestBenchmark = null;
  let smallestDifference = Infinity;



  benchmarks.forEach(benchmark => {
    console.log(`Benchmark date: ${benchmark.date}`);
    let difference = Math.abs(now - benchmark.date - ONE_WEEK_IN_MS);
    console.log(`Difference: ${difference}`);
    if (difference < smallestDifference) {
      smallestDifference = difference;
      closestBenchmark = benchmark;
    }
  });

  if (closestBenchmark === null) {
    throw new Error(`No benchmark under '${benchToCompare}' is close to one week old.`);
  } else {
    console.log(`The closest benchmark to one week old under '${benchToCompare}' is:`, closestBenchmark);
    return convertBenchDataToCompleteBenchmarkInstance(closestBenchmark, benchToCompare);
  }
}

module.exports.getBenchmarkOfStableBranch = function (benchToCompare, folderWithBenchData,
                                                      fileNameWithBenchData, latestBenchSha) {

  let data = module.exports.getCompleteBenchData(
        folderWithBenchData, fileNameWithBenchData
    );
  let benchmarks = data.entries[benchToCompare];
  // find benchmark with commit sha == latestBenchSha
  let benchmark = benchmarks.find(benchmark => benchmark.commit.id === latestBenchSha);
  core.debug(`Benchmark of stable branch: ${JSON.stringify(benchmark)}`);

    if (benchmark === undefined) {
        throw new Error(`No benchmark under '${benchToCompare}' with commit sha ${latestBenchSha} found.`);
    } else {
        console.log(`The benchmark of the stable branch under '${benchToCompare}' is:`, benchmark);
        return convertBenchDataToCompleteBenchmarkInstance(benchmark, benchToCompare);
    }
}


