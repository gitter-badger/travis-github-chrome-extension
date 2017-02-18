import {trimTimeStr, trimMessage, trimTimeToMinScale} from './common/util';
import {GITHUB_GREY, GREEN, RED, YELLOW, GLOBAL_FONT_FAMILY} from './common/constants';
import $ from 'jquery';
import './lib/canvasjs.min';

const bodyBgColor = $('body').css('background-color');
const allColor = [GREEN, RED, YELLOW];
const columnAmount = 10;
const travisIcon = chrome.extension.getURL('/travis-icon.png');
// Generate the chart elements.
const chartDiv = $('<div id="chartHeader" class="commit-tease" style="width: 100%; padding: 5px 10px; cursor: pointer;">' +
         `<h5><img src="${travisIcon}" height="20" style="vertical-align: middle;">` +
         ' Travis-CI Build Chart</h5>' +
        '</div>' +
        '<div id="chartContainer" class="overall-summary" style="height: 300px; width: 100%;"></div>');

let bIsChartRendered = false;

const render = (chart) => {
  chart.render();
  bIsChartRendered = true;
};

const renderOrHideChart = (isFirstTime, chart) => {
  if (isFirstTime && localStorage['chartHeaderHidden'] === 'true') {
    // Hide the chartContainer element if previously hidden
    $('#chartContainer').hide();
  } else {
    // Otherwise we render the Chart and record that it has been rendered
    render(chart);
  }
};

const showChart = (isFirstTime) => {
  const overallDiv = $('div.file-navigation.in-mid-page');
  if (overallDiv.length !== 0) {
    const ownerAndProject = $('h1.public > strong > a')[0].pathname;
    const jsonPath = `https://api.travis-ci.org/repositories${ownerAndProject}/builds.json`;

    const xhr = new XMLHttpRequest();
    xhr.open('GET', jsonPath, true);

    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText);
  		if (data.length) {
  			chartDiv.insertAfter(overallDiv[0]);

        let range = (data.length < columnAmount) ? data.length : columnAmount;
        let info = getInfoFromJson(data, range);
  			let chart = buildChart(info, data);

        renderOrHideChart(isFirstTime, chart);

        if (isFirstTime) {
          bindToggleToHeader(chart);
        }
  		}
    };
    xhr.send();
  }
};

const bindToggleToHeader = (chart) => {
  $('#chartHeader').click(() => {
    const chartDiv = $('#chartHeader').next('#chartContainer');
    // Toggle the chartContainer visibility
    chartDiv.slideToggle(150, () => {
      // Record the current visibility state
      localStorage['chartHeaderHidden'] = $(chartDiv).is(':hidden');

      if (!bIsChartRendered) {
        render(chart);
      }
    });
  });
};

const assembleDataPoints = (info, data) => {
  let dataPoints = [];
  const ownerAndProject = $('h1.public > strong > a')[0].pathname;
  const onClick = (e) => {
    let order = (columnAmount - 1) - e.dataPoint.x;
    window.open(`https://travis-ci.org${ownerAndProject}/builds/${data[order]['id']}`, '_blank');
  };

  for (let i = columnAmount - 1; i >= 0; i--) {
    let dataPoint = { label: (i === 0) ? `Latest:${info.buildNum[i]}` : info.buildNum[i],
                      y: info.buildTime[i],
                      color: info.buildColor[i],
                      toolTipContent: info.buildInfo[i],
                      click: onClick,
                      cursor: 'pointer' };
    dataPoints.push(dataPoint);
  }

  return dataPoints;
};


const buildChart = (info, data) => {
  return new CanvasJS.Chart('chartContainer', {
    width: $('#chartHeader').width(),
    height: 298,
    backgroundColor: bodyBgColor,
    animationEnabled: true,
    title: {
      text: 'Build Status (Recent 10 builds)',
      fontFamily: GLOBAL_FONT_FAMILY,
      fontWeight: 'normal',
      fontColor: GITHUB_GREY,
      fontSize: 20
    },
    axisX: {
      title: 'Build Number',
      titleFontFamily: GLOBAL_FONT_FAMILY,
      titleFontWeight: 'normal',
      titleFontSize: 12
    },
    axisY: {
      title: 'Build Time (Minutes)',
      titleFontFamily: GLOBAL_FONT_FAMILY,
      titleFontWeight: 'normal',
      titleFontSize: 12
    },
    toolTip:{
      fontFamily: GLOBAL_FONT_FAMILY
    },
    data: [{
        type: 'column', //change type to bar, line, area, pie, etc
        dataPoints: assembleDataPoints(info, data)
    }]
  });
};

const trimBuildNums = (range, info) => {
  for (let i = range; i < columnAmount; i++) {
    if (typeof info.buildNum[i] === 'undefined') {
      info.buildNum[i] = '#';
    }
  }
};

const mapBuildData = (range, data) => {
  let buildNum = [],
    buildTime = [],
    buildColor = [],
    buildInfo = [];
  const GREEN_INDEX = 1;

  for (let i = 0; i < range; i++) {
    let buildDuration = trimTimeToMinScale(data[i]['duration']);
    let buildState = data[i]['state'];
    let buildResult = data[i]['result'];
    let buildMessage = trimMessage(data[i]['message']);
    let buildStarted = data[i]['started_at'];
    let buildFinished = data[i]['finished_at'];
    let buildTimeStr = trimTimeStr(data[i]['duration']);

    buildNum.push(`#${data[i]['number']}`);
    buildInfo.push(`<b>Build Time</b>: ${buildTimeStr}<br/><span><b>Message: </b>${buildMessage}</span>`);
    buildTime.push(buildDuration);

    if (buildState === 'started') {
      buildColor.push(allColor[2]);
      if (buildStarted && buildFinished === null) {
        let skipTime = (new Date() - new Date(buildStarted)) / 1000;
        let skipTimeStr = trimTimeStr(skipTime);
        buildTime[i] = trimTimeToMinScale(skipTime);
        buildInfo[i] = `It's running! <b>Skipped time</b>:${skipTimeStr}<br/><span><b>Message:</b>${buildMessage}</span>`;
      } else {
        buildInfo[i] = `Oops, the build may be cancelled.<br/><span><b>Message:</b>${buildMessage}</span>`;
      }
    } else {
      buildResult = (buildResult === null) ? GREEN_INDEX : buildResult;
      buildColor.push(allColor[buildResult]);
    }
  }
  return {buildNum: buildNum, buildTime: buildTime, buildColor: buildColor, buildInfo: buildInfo};
};

const getInfoFromJson = (data, range) => {
  let info = {};
  const __ret = mapBuildData(range, data);

  info.buildNum = __ret.buildNum;
  info.buildTime = __ret.buildTime;
  info.buildColor = __ret.buildColor;
  info.buildInfo = __ret.buildInfo;

  trimBuildNums(range, info);

  return info;
};

const isChartNonexisted = () => {
  return $('#chartContainer').length === 0;
};

const isNotChartHeader = (event) => {
  return $(event.target).text().indexOf('Travis-CI Build Chart') === -1;
};

export {showChart, isChartNonexisted, isNotChartHeader};