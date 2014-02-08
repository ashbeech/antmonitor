﻿(function _ANTMonitorUI() {
    'use strict';

    

    function HostEnvironment()
    {}

    HostEnvironment.prototype.PROTOCOL = {
        MS: 'ms-appx:',
        CHROME: 'chrome-extension:'
    };

    function ANTMonitorUI()
    {
        var requirejsConfiguration;

        this.name = 'UI frame';

        this.hostEnvironmentReady = false;

        window.addEventListener('message', this.onmessage.bind(this));

        setTimeout(function () {
            if (!this.hostEnvironmentReady) {
                if (this.logger && this.logger.logging) this.logger.log('warn', 'Has not received ready from host environment - messages will probably not reach host');
            }
        }.bind(this), 3000);

        console.info(this.name+' location: ' + window.location.href);

        requirejsConfiguration = {

            baseUrl: '../bower_components/libant',

            paths: {

                // Persistence

                //db: '../../scripts/db',

                vm: '../../scripts/viewmodel',

                converter : '../../scripts/converter'
                
            },

        };

        requirejs.config(requirejsConfiguration);

        requirejs(['vm/sensorVM', 'vm/temperatureVM', 'vm/footpodVM', 'vm/HRMVM', 'vm/SPDCADVM', 'vm/TimerVM', 'logger', 'converter/temperatureConverter'],
            function (SensorVM,TemperatureVM,FootpodVM,HRMVM,SPDCADVM,TimerVM,Logger,TempConverter) {

                this.logger = new Logger(true);

                this.sendReadyEvent();

                this.timerID = {
                    interval: {},
                    timer: {}
                };

                this.timezoneOffsetInMilliseconds = this.getTimezoneOffsetInMilliseconds();

                this.initViewModels(SensorVM, TemperatureVM, FootpodVM, HRMVM, SPDCADVM, TimerVM, Logger, TempConverter);

    

        }.bind(this));

       
    }

    ANTMonitorUI.prototype.onmessage = function (event)
    {
        try {


            var sourceWindow = event.source,
                data = event.data;

            //// Skip unknown protocols if available
            //if (sourceWindow && (sourceWindow.location.protocol !== HostEnvironment.prototype.PROTOCOL.MS) && (sourceWindow.location.protocol !== HostEnvironment.prototype.PROTOCOL.CHROME)) {
            //    if (this.logger && this.logger.logging) {
            //        this.logger.log('error', 'Received message event from source with a protocol that cannot be handled');
            //        return;
            //    }

            //}

            if (this.logger && this.logger.logging) this.logger.log('info', this.name+' received message event', event);

            if (data === 'ready') {
                this.hostEnvironmentReady = true;
                if (this.logger && this.logger.logging)
                    this.logger.log('log', this.name+' ready to process messages');
            } else if (data && data.page) {
                if (this.logger && this.logger.logging)
                    this.logger.log('log', this.name+' received page', data.page);

                this.onpage(data.page);
            }

        } catch (e) { // Maybe a dataclone error
            if (this.logger && this.logger.logging)
                this.logger.log('error', ' error', 'Event', event, e);
        }
        

    }

    ANTMonitorUI.prototype.sendReadyEvent = function () {
       
        // For Chrome App pr. 29012014 : Sending message from a sandboxed page (in manifest.json) gives origin = 'null' on the receiving window
        // Only '* targetOrigin is supported in Chrome App, tried with '/', but got "Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('null') does not match the recipient window's origin ('chrome-extension://njnnocbhcjoigjfpfgkglahgjhppagmp')."

       window.parent.postMessage('ready', '*');
    }

    ANTMonitorUI.prototype.initViewModels = function (SensorVM, TemperatureVM, FootpodVM, HRMVM, SPDCADVM, TimerVM, Logger, TemperatureConverter) {

        var rootVM; // Root viewmodel, contains all the other sub-view models
        var tempModeKey;
        var sensorChart;

        // Holds chart instances
        this.sensorChart = {};
        sensorChart = this.sensorChart;

        // Holds knockoutjs viewmodel constructor functions and root
        this.viewModel = {};

        // Viewmodel constructors

        this.viewModel.SensorVM = SensorVM;
        this.viewModel.TemperatureVM = TemperatureVM;
        this.viewModel.FootpodVM = FootpodVM;
        this.viewModel.HRMVM = HRMVM;
        this.viewModel.SPDCADVM = SPDCADVM;
        this.viewModel.timerVM = TimerVM;

        // Holds references to the viewmodel for a particular sensor (using sensorId based on ANT channelId)

        this.viewModel.sensorDictionary = {};

        //if (Storage)
        //    this.storage = new Storage();

        this.tempConverter = new TemperatureConverter();

        this.viewModel.rootVM = {

            settingVM: {

                logging: ko.observable(true),     // Enable logging to console  - will decrease performance

                showAdditionalInfo: ko.observable(false),

                showCredits: ko.observable(false),

                temperatureModes: TemperatureVM.prototype.MODES,

                showSensors: {

                    HRM: ko.observable(false),
                    
                    SPDCAD: ko.observable(false),

                    ENVIRONMENT: ko.observable(false),

                },

                tracking: {

                    liveTracking: false,

                    startTime: Date.now() + this.timezoneOffsetInMilliseconds,

                    stopTime : undefined

                    
                }
            },

            // Holds an array on viewmodels for the sensors that are discovered
            sensorVM: undefined,

            // Contains all enumerated devices that fullfill the USB selector
            deviceVM: {

                enumerationCompleted: ko.observable(false),

                enumeratedDevice: ko.observableArray(),

                // User selected default device id.

                selectedDevice: ko.observable(),

            },

            timerVM: {

            }

        };

        rootVM = this.viewModel.rootVM;

        rootVM.settingVM.refreshChart = function () {
            var currentSeries,
               seriesNr,
               len,
               chart,
               dateTimeAxis;
              

            if (sensorChart && sensorChart.integrated) {

                rootVM.settingVM.tracking.liveTracking = false;

                chart = sensorChart.integrated.chart;

                // Remove plot lines

                dateTimeAxis = chart.get('datetime-axis');
                if (dateTimeAxis) {

                        dateTimeAxis.removePlotLine(); // undefined id will delete all plotlines (using id === undefined)

                }

                // Remove series data

                for (seriesNr = 0, len = chart.series.length; seriesNr < len; seriesNr++) {

                    currentSeries = chart.series[seriesNr];

                    currentSeries.setData([], false);
                }

            }
               
        }.bind(this);

        rootVM.settingVM.startTimer = function ()
        {
            // Reset series

            if (rootVM.settingVM.tracking.liveTracking)
                return;

            var chart,
              
                dateTimeAxis,
                id;

            if (sensorChart && sensorChart.integrated) {
                chart = sensorChart.integrated.chart;

                //for (seriesNr = 0, len = chart.series.length; seriesNr < len; seriesNr++) {

                //    currentSeries = chart.series[seriesNr];

                //    currentSeries.setData([], false);
                //}

                rootVM.settingVM.tracking.liveTracking = true;
                rootVM.settingVM.tracking.startTime = Date.now() + this.timezoneOffsetInMilliseconds;

                dateTimeAxis = chart.get('datetime-axis');
                if (dateTimeAxis) {
                    //id = 'plotline-'+rootVM.settingVM.tracking.plotLines.length;
                   dateTimeAxis.addPlotLine({
                       // id : id, 
                        color: 'green',
                        dashStyle: 'dash',
                        width: 2,
                        value: rootVM.settingVM.tracking.startTime
                   });

                  // rootVM.settingVM.tracking.plotLines.push(id);
                }

            }

            }.bind(this);

        rootVM.settingVM.stopTimer = function () {

            var chart,
                dateTimeAxis,
                id;

            if (!rootVM.settingVM.tracking.liveTracking)
                return;

            rootVM.settingVM.tracking.stopTime = Date.now() + this.timezoneOffsetInMilliseconds;
            rootVM.settingVM.tracking.liveTracking = false;

            if (sensorChart && sensorChart.integrated) {
                chart = sensorChart.integrated.chart;

                dateTimeAxis = chart.get('datetime-axis');
                if (dateTimeAxis) {
                    //id = 'plotline-' + rootVM.settingVM.tracking.plotLines.length
                      dateTimeAxis.addPlotLine({
                       // id: id,
                        color: 'red',
                        dashStyle: 'dash',
                        width: 2,
                        value: rootVM.settingVM.tracking.stopTime
                    });

                   //   rootVM.settingVM.tracking.plotLines.push(id);

                }
            }
        }.bind(this);

        rootVM.settingVM.newLap = function ()
        {

        }

        // Function is also called during applyBindings at initialization
        rootVM.settingVM.showSensors.toggle = function (sensorType) {

            rootVM.settingVM.showSensors[sensorType](!rootVM.settingVM.showSensors[sensorType]());

            var visible = rootVM.settingVM.showSensors[sensorType](),
                chart,
                currentSeries,
                seriesNr,
                len;

            // Toggle series visibility for device type, i.e hrm

            if (this.sensorChart && this.sensorChart.integrated && this.sensorChart.integrated.chart) {
                chart = this.sensorChart.integrated.chart;

                for (seriesNr = 0, len = chart.series.length; seriesNr < len; seriesNr++) {

                    currentSeries = chart.series[seriesNr];

                    if (currentSeries.options.id.indexOf(sensorType) !== -1) {

                        if (visible && !currentSeries.visible) {

                            currentSeries.show();

                        }

                        else if (currentSeries.visible) {
                          
                                currentSeries.hide();
                            }
                    }

                }
            }



        }.bind(this);

        rootVM.settingVM.toggleShowCredits = function (data, event) {
            rootVM.settingVM.showCredits(!rootVM.settingVM.showCredits());
        };

        rootVM.settingVM.toggleShowAdditionalInfo = function (data, event) {
            rootVM.settingVM.showAdditionalInfo(!rootVM.settingVM.showAdditionalInfo());
        };

        //tempModeKey = this.storage.__proto__.key.temperaturemode;

        //this.storage.get(tempModeKey, function _fetchTemperatureMode(db) {

        //    var show24hMaxMinKey = this.storage.__proto__.key.show24hMaxMin;

        //    rootVM.settingVM.temperatureMode = ko.observable(db[tempModeKey] || TemperatureVM.prototype.MODE.CELCIUS);

        //    this.storage.get(show24hMaxMinKey, function _fetchShow24hMaxMin(db) {

        //        rootVM.settingVM.show24H = ko.observable(db[show24hMaxMinKey] === "true" || false);

        //        this.configureKnockout();

        //    }.bind(this));

        //}.bind(this));

        this.configureKnockout();

    };

    ANTMonitorUI.prototype.configureKnockout = function () {

        var rootVM = this.viewModel.rootVM;

        // Subscribe to changes

        //rootVM.settingVM.show24H.subscribe(function (show24h) {
        //    this.storage.set(this.storage.__proto__.key.show24hMaxMin, show24h);
        //}.bind(this));

        rootVM.deviceVM.selectedDevice.subscribe(function (deviceInformation) {

            var storedDefaultDeviceId;

            this.storage.get(this.storage.__proto__.key.defaultDeviceId, function (db) {
                storedDefaultDeviceId = db[this.storage.__proto__.key.defaultDeviceId];

                if (deviceInformation && (storedDefaultDeviceId !== deviceInformation.id)) {
                    this.storage.set(this.storage.__proto__.key.defaultDeviceId, deviceInformation.id);
                    this.exitAndResetDevice(function _initANT() {
                        // Remove previous state
                        rootVM.deviceVM.enumeratedDevice.removeAll();
                        this._initANTHost(pageHandler);
                    }.bind(this));
                }
            }.bind(this));

        }.bind(this));

        //rootVM.settingVM.temperatureMode.subscribe(function (newMode) {

        //    var temperatureAxis = this.sensorChart.integrated.chart.yAxis[0],
        //        seriesData,
        //        TemperatureVM = this.viewModel.TemperatureVM;

        //    this.storage.set(this.storage.__proto__.key.temperaturemode, newMode);

        //    for (var serieNr = 0; serieNr < this.sensorChart.integrated.chart.series.length; serieNr++) {

        //        if (this.sensorChart.integrated.chart.series[serieNr].name.indexOf('Temperature') !== -1) {
        //            seriesData = this.sensorChart.integrated.chart.series[serieNr].options.data;

        //            // Convert y-point to requested temperature mode

        //            for (var point = 0; point < seriesData.length; point++) {
        //                if (newMode === TemperatureVM.prototype.MODE.FAHRENHEIT) {

        //                    seriesData[point][1] = this.tempConverter.fromCelciusToFahrenheit(seriesData[point][1]);


        //                } else if (newMode === TemperatureVM.prototype.MODE.CELCIUS) {
        //                    seriesData[point][1] = this.tempConverter.fromFahrenheitToCelcius(seriesData[point][1]);

        //                    temperatureAxis.setExtremes(-20, null, false);
        //                }

        //            }

        //            if (newMode === TemperatureVM.prototype.MODE.FAHRENHEIT)
        //                temperatureAxis.setExtremes(-4, null, false);
        //            else if (newMode === TemperatureVM.prototype.MODE.CELCIUS)
        //                temperatureAxis.setExtremes(-20, null, false);

        //            this.sensorChart.integrated.chart.series[serieNr].setData(this.sensorChart.integrated.chart.series[serieNr].options.data, false, false);

        //        }

        //    }

        //    this.redrawIntegratedChart();

        //}.bind(this));

        rootVM.sensorVM = new this.viewModel.SensorVM({ log: rootVM.settingVM.logging() });

        // window.addEventListener('message', pageHandler);

        // Activate knockoutjs on our root viewmodel

        var rootElement = document.getElementById('appRootVM');

        ko.applyBindings(rootVM, rootElement);

        rootElement.style.display = "block";

        this.createIntegratedChart();

        //// bind sets the internal BoundThis property of this.PageHandler to this
        //this._initANTHost(this.onpage.bind(this));
    };

    ANTMonitorUI.prototype.createIntegratedChart = function () {

        var rootVM = this.viewModel.rootVM,
            antUI = this,
            integratedChart;

        this.sensorChart.integrated = {
            options: {}
        };
       
        integratedChart = this.sensorChart.integrated;

       
        this.sensorChart.integrated.chart = new Highcharts.Chart({

            chart: {
                renderTo: 'sensorChart-integrated',
                backgroundColor: 'transparent',
                animation: false,
                //height: 80,
                //width: 200,
                //  spacing: [7, 7, 7, 7]
            },

            title: {
                text: '',
            },

            yAxis: [

                {
                    id: 'temperature-axis',

                    title: {
                        text: 'Temperature',
                        style: {
                            color: 'yellow',
                            fontSize: '14px',
                            fontWeight : 'bold'
                        }
                    },

                    min: (function (antUI) {
                        var TemperatureVM = antUI.viewModel.TemperatureVM;

                        if (rootVM.settingVM.temperatureMode && rootVM.settingVM.temperatureMode() === TemperatureVM.prototype.MODE.CELCIUS)
                            return -20;
                        else if (rootVM.settingVM.temperatureMode && rootVM.settingVM.temperatureMode() === TemperatureVM.prototype.MODE.FAHRENHEIT)
                            return -4;
                        else
                            return -20;

                    })(antUI),

                    //max: (function () {
                    //    if (rootVM.settingVM.temperatureMode() === TemperatureVM.prototype.MODE.CELCIUS)
                    //        return 60;
                    //    else if (rootVM.settingVM.temperatureMode() === TemperatureVM.prototype.MODE.FAHRENHEIT)
                    //        return 140;
                    //    else
                    //        return 60;

                    //})(),

                    gridLineWidth: 0,

                    showEmpty: false,

                    tooltip: {
                        enabled: false
                    },

                    labels:
                    {
                        enabled: true,
                        style: {
                            //color: '#6D869F',
                            fontWeight: 'bold',
                            fontSize: '14px'
                        }
                    }

                },

                {
                    id: 'heartrate-axis',
                    title: {
                        text: 'Heart rate',
                        style: {
                            color: 'red',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }
                    },

                    min: 0,
                    //max: 255,

                    gridLineWidth: 0,

                    //tickPositions: [],

                    //startOnTick: false,

                    // endOnTick: false,

                    showEmpty: false,

                    // Does not disable tooltip generation (series.tooltips) -> set  enableMouseTracking = false in invd. series options
                    tooltip: {
                        enabled: false
                    },

                    labels:
                    {
                        enabled: true,
                        style: {
                            //color: '#6D869F',
                            fontWeight: 'bold',
                            fontSize: '14px'
                        }
                    }

                },

                 {
                     id: 'footpod-speed-axis',
                     title: {
                         text: 'Footpod speed',
                         style: {
                             color: 'green',
                             fontSize: '14px',
                             fontWeight: 'bold'
                         }
                     },

                     min: 0,
                     //max: 255,

                     gridLineWidth: 0,

                     //tickPositions: [],

                     //startOnTick: false,

                     // endOnTick: false,

                     showEmpty: false,

                     // Does not disable tooltip generation (series.tooltips) -> enableMouseTracking = false
                     tooltip: {
                         enabled: false
                     },

                     opposite: true,

                     labels:
                    {
                        enabled: true,
                        style: {
                            //color: '#6D869F',
                            fontWeight: 'bold',
                            fontSize: '14px'
                        }
                    }


                 },

                 {
                     id: 'bike-speed-axis',
                     title: {
                         text: 'Speed',
                         style: {
                             color: 'blue'
                         }
                     },

                     min: 0,
                     //max: 255,

                     gridLineWidth: 0,

                     //tickPositions: [],

                     //startOnTick: false,

                     // endOnTick: false,

                     showEmpty: false,

                     // Does not disable tooltip generation (series.tooltips) -> must use enableMouseTracking = false
                     tooltip: {
                         enabled: false
                     },

                     opposite: true,

                     labels:
                    {
                        enabled: true,
                        style: {
                            //color: '#6D869F',
                            fontWeight: 'bold',
                            fontSize: '14px'
                        }
                    }


                 },

                 {
                     id: 'bike-cadence-axis',
                     title: {
                         text: 'Cadence',
                         style: {
                             color: 'magenta',
                             fontSize: '14px',
                             fontWeight: 'bold'
                         }
                     },

                     min: 0,
                     //max: 255,

                     gridLineWidth: 0,

                     //tickPositions: [],

                     //startOnTick: false,

                     // endOnTick: false,

                     showEmpty: false,

                     // Does not disable tooltip generation (series.tooltips) -> must use enableMouseTracking = false
                     tooltip: {
                         enabled: false
                     },

                     opposite: true,

                     labels:
                    {
                        enabled: true,
                        style: {
                            //color: '#6D869F',
                            fontWeight: 'bold',
                            fontSize: '14px'
                        }
                    }


                 },

                  {
                      id: 'hrm-rr-axis',
                      title: {
                          text: 'RR',
                          style: {
                              color: 'gray',
                              fontSize: '14px',
                              fontWeight: 'bold'
                          }
                      },

                      min: 0,
                      //max: 255,

                      gridLineWidth: 0,

                      //tickPositions: [],

                      //startOnTick: false,

                      // endOnTick: false,

                      showEmpty: false,

                      // Does not disable tooltip generation (series.tooltips) -> must use enableMouseTracking = false
                      tooltip: {
                          enabled: false
                      },

                      opposite: true,

                      labels:
                     {
                         enabled: true,
                         style: {
                             //color: '#6D869F',
                             fontWeight: 'bold',
                             fontSize: '14px'
                         }
                     }


                  }


            ],

            xAxis: [{

                id: 'datetime-axis',

                type: 'datetime',

                // Turn off X-axis line
                //lineWidth: 0,

                // Turn off tick-marks
                //tickLength: 0,

                //tickPositions: [],

                labels:
                    {
                        enabled: true,
                        style: {
                            //color: '#6D869F',
                            fontWeight: 'bold',
                            fontSize: '14px',

                        },
                        
                        y: 18
                    },

            },

            //{

            //    id: 'category-axis',



            //    type: 'category',

            //    categories : [],

            //    // Turn off X-axis line
            //    lineWidth: 0,

            //    // Turn off tick-marks
            //    //tickLength: 0,

            //    //tickPositions: [],

            //    //labels:
            //    //    {
            //    //        enabled: true,
            //    //        style: {
            //    //            //color: '#6D869F',
            //    //            fontWeight: 'bold',
            //    //            fontSize: '14px',

            //    //        },
            //    //        y: 18
            //    //    },

            //    visible : false

            //}
            ],

            series: []




        });

        // Get default x-Axis formatter;

        var xAxis = this.sensorChart.integrated.chart.get('datetime-axis');

        this.sensorChart.integrated.options.defaultxAxisLabelFormatter = xAxis.labelFormatter; // Keep reference to avoid possible garbage collection of formatter
        this.sensorChart.integrated.options.liveTrackingxAxisLabelFormatter = function () {
           
            if (!rootVM.settingVM.tracking.liveTracking) 
               return integratedChart.options.defaultxAxisLabelFormatter.call(this); // Highcharts.Axis.prototype.defaultLabelFormatter
           
            var startTime = rootVM.settingVM.tracking.startTime,
                stopTime = rootVM.settingVM.tracking.stopTime;

            if (startTime > this.value || stopTime < this.value)
                return undefined;


                // Based on http://stackoverflow.com/questions/1322732/convert-seconds-to-hh-mm-ss-with-javascript
                var totalSec = (this.value - startTime) / 1000;
                var hours = Math.floor(totalSec / 3600 % 24);
                var minutes = Math.floor(totalSec / 60 % 60);
                var seconds = Math.floor(totalSec % 60);

                var hoursStr;

                if (hours === 0)
                    hoursStr = ''; 
                else
                    hoursStr = (hours < 10 ? "0" + hours : hours) +':';

                var result = hoursStr + (minutes < 10 ? "0" + minutes : minutes) + ":" + (seconds < 10 ? "0" + seconds : seconds);

                return result;
          
        };

        // Override default formatter with our new live tracking formatter
        xAxis.labelFormatter = this.sensorChart.integrated.options.liveTrackingxAxisLabelFormatter;

        this.startRedrawInterval(1000);

        // TEST change formatter on x-Axis 
        // setInterval(function () {
        //    integratedChart.options.liveTracking = !integratedChart.options.liveTracking;
        //}, 5000);

    };

    ANTMonitorUI.prototype.addTemperatureSeries = function (page) {

        var addedSeries,
            rootVM = this.viewModel.rootVM,
            TemperatureVM = this.viewModel.TemperatureVM,
            deviceTypeVM,
            sensorId = page.broadcast.channelId.sensorId,
            handlerLogger = rootVM.sensorVM.getLogger();

        addedSeries = this.sensorChart.integrated.chart.addSeries(
            {
                name: 'Temperature ' + sensorId,
                id: 'ENVIRONMENT-current-' + sensorId,
                color: 'yellow',
                data: [], // tuples [timestamp,value]
                type: 'spline',

                //marker : {
                //    enabled : true,
                //    radius : 2
                //},

                yAxis: 0,

                tooltip: {
                    valueDecimals: 2,
                    valueSuffix: ' °'
                }
            }, false, false);

        deviceTypeVM = new TemperatureVM({
            logger: handlerLogger,
            temperatureMode: rootVM.settingVM.temperatureMode,
            sensorId: sensorId
        });

        this.viewModel.sensorDictionary[sensorId] = deviceTypeVM;

        deviceTypeVM.updateFromPage(page);

        rootVM.sensorVM.devices.ENVIRONMENT.push(deviceTypeVM);

        rootVM.sensorVM.deviceTypeVM.push(deviceTypeVM);


        if (page.currentTemp !== undefined) {

            if (rootVM.settingVM.temperatureMode && rootVM.settingVM.temperatureMode() === TemperatureVM.prototype.MODE.FAHRENHEIT) {
                addedSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, this.tempConverter.fromCelciusToFahrenheit(page.currentTemp)], true, false, false);

            }
            else {

                addedSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, page.currentTemp], true, false, false);


            }


        }
    };

    ANTMonitorUI.prototype.addHRMSeries = function (page) {

        var addedSeries,
           rootVM = this.viewModel.rootVM,
           HRMVM = this.viewModel.HRMVM,
           deviceTypeVM,
           sensorId = page.broadcast.channelId.sensorId,
           handlerLogger = rootVM.sensorVM.getLogger();

        addedSeries = this.sensorChart.integrated.chart.addSeries(
          {
              name: 'Heartrate ' + sensorId,
              id: 'HRM-current-' + sensorId,
              color: 'red',
              data: [], // tuples [timestamp,value]
              type: 'spline',

              marker: {
                  enabled: false
                  // radius : 2
              },

              yAxis: 1,

              tooltip: {
                  enabled: false
              },

              //tooltip: {
              //    valueDecimals: 0,
              //    valueSuffix: ' bpm'
              //},

              // Disable generation of tooltip data for mouse tracking - improve performance

              enableMouseTracking: false

          }, false, false);

        deviceTypeVM = new HRMVM({
            logger: handlerLogger,
            sensorId: sensorId
        });

        this.viewModel.sensorDictionary[sensorId] = deviceTypeVM;

        rootVM.sensorVM.devices.HRM.push(deviceTypeVM);

        deviceTypeVM.updateFromPage(page);

        rootVM.sensorVM.deviceTypeVM.push(deviceTypeVM);


        if (page.computedHeartRate !== undefined && page.computedHeartRate !== HRMVM.prototype.INVALID_HR) {


            addedSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, page.computedHeartRate], false, false, false);

        }

        // RR

        addedSeries = this.sensorChart.integrated.chart.addSeries(
          {
              name: 'RR ' + sensorId,
              id: 'RR-' + sensorId,
              color: 'gray',
              data: [], // tuples [timestamp,value]
              type: 'spline',

              marker: {
                  enabled: false
                  // radius : 2
              },

              yAxis: 5,
              xAxis: 0,

              tooltip: {
                  enabled: false
              },

              //tooltip: {
              //    valueDecimals: 0,
              //    valueSuffix: ' bpm'
              //},

              // Disable generation of tooltip data for mouse tracking - improve performance

              enableMouseTracking: false,

              visible: false,

          }, false, false);

        this.processRR(page);

        this.redrawIntegratedChart();

    };

    ANTMonitorUI.prototype.addSPDCADSeries = function (page) {

        var addedSeries,
           rootVM = this.viewModel.rootVM,
           SPDCADVM = this.viewModel.SPDCADVM,
             deviceTypeVM,
           sensorId = page.broadcast.channelId.sensorId,
            handlerLogger = rootVM.sensorVM.getLogger();

        addedSeries = this.sensorChart.integrated.chart.addSeries(
           {
               name: 'Cadence ' + sensorId,
               id: 'SPDCAD-cadence-' + sensorId,
               color: 'magenta',
               data: [], // tuples [timestamp,value]
               type: 'spline',

               marker: {
                   enabled: false
                   // radius : 2
               },

               yAxis: 4,

               tooltip: {
                   enabled: false
               },

               //tooltip: {
               //    valueDecimals: 0,
               //    valueSuffix: ' bpm'
               //},

               // Disable generation of tooltip data for mouse tracking - improve performance

               enableMouseTracking: false

           }, false, false);

        deviceTypeVM = new SPDCADVM({
            logger: handlerLogger,
            sensorId: sensorId
        });

        this.viewModel.sensorDictionary[sensorId] = deviceTypeVM;

        deviceTypeVM.updateFromPage(page);

        rootVM.sensorVM.devices.SPDCAD.push(deviceTypeVM);

        rootVM.sensorVM.deviceTypeVM.push(deviceTypeVM);

        if (page.cadence !== undefined) {

            addedSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, page.cadence], false, false, false);
        }

        addedSeries = this.sensorChart.integrated.chart.addSeries(
           {
               name: 'Speed ' + sensorId,
               id: 'SPDCAD-speed-' + sensorId,
               color: 'blue',
               data: [], // tuples [timestamp,value]
               type: 'spline',

               marker: {
                   enabled: false
                   // radius : 2
               },

               yAxis: 3,

               tooltip: {
                   enabled: false
               },

               //tooltip: {
               //    valueDecimals: 0,
               //    valueSuffix: ' bpm'
               //},

               // Disable generation of tooltip data for mouse tracking - improve performance

               enableMouseTracking: false

           }, false, false);

        if (page.unCalibratedSpeed !== undefined) {

            // Converted speed taking wheel circumference into account
            addedSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, deviceTypeVM.speed()], false, false, false);

        }

        this.redrawIntegratedChart();

    };

    ANTMonitorUI.prototype.addFootpodSeries = function (page) {

        var addedSeries,
         rootVM = this.viewModel.rootVM,
         FootpodVM = this.viewModel.FootpodVM,
         deviceTypeVM,
         sensorId = page.broadcast.channelId.sensorId,
         handlerLogger = rootVM.sensorVM.getLogger();

        addedSeries = this.sensorChart.integrated.chart.addSeries(
           {
               name: 'Footpod ' + sensorId,
               id: 'footpod-speed-' + sensorId,
               color: 'green',
               data: [], // tuples [timestamp,value]
               type: 'spline',

               marker: {
                   enabled: false
                   // radius : 2
               },

               yAxis: 2, // Footpod

               tooltip: {
                   enabled: false
               },

               //tooltip: {
               //    valueDecimals: 0,
               //    valueSuffix: ' bpm'
               //},

               // Disable generation of tooltip data for mouse tracking - improve performance

               enableMouseTracking: false

           }, false, false);

        deviceTypeVM = new FootpodVM({
            logger: handlerLogger,
            sensorId: sensorId
        });

        this.viewModel.sensorDictionary[sensorId] = deviceTypeVM;

        deviceTypeVM.updateFromPage(page);

        rootVM.sensorVM.deviceTypeVM.push(deviceTypeVM);

        if (page.speed !== undefined) {

            addedSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, page.speed], false, false, false);

        }

        this.redrawIntegratedChart();

    };

    ANTMonitorUI.prototype.redrawIntegratedChart = function () {
        this.sensorChart.integrated.lastRedrawTimestamp = Date.now(); // Last redraw time
        this.sensorChart.integrated.chart.redraw();
    };

    ANTMonitorUI.prototype.processRR = function (page) {

        var currentSeries,
            currentTimestamp,
            len,
            RRmeasurementNr,
            sensorId = page.broadcast.channelId.sensorId,
            shiftSeries = false;

        // If aggregated RR data is available process it (buffered data in deviceProfile)

        if (page.aggregatedRR) {
            currentSeries = this.sensorChart.integrated.chart.get('RR-' + sensorId);
            currentTimestamp = page.timestamp + this.timezoneOffsetInMilliseconds;
            // Start with the latest measurement and go back in time
            for (len = page.aggregatedRR.length, RRmeasurementNr = len - 1; RRmeasurementNr >= 0; RRmeasurementNr--) {
                currentSeries.addPoint([currentTimestamp, page.aggregatedRR[RRmeasurementNr]], false,
          // currentSeries.data.length >= (currentSeries.chart.plotWidth || 1024), false);
          //currentSeries.data.length >= 30, false);
          shiftSeries, false);
                //if (this.log && this.log.logging)
                //    this.log.log('info', currentTimestamp, RRmeasurementNr, page.aggregatedRR[RRmeasurementNr]);
                currentTimestamp -= page.aggregatedRR[RRmeasurementNr];
            }
        }
    };

    ANTMonitorUI.prototype.onpage = function (page) {

        //  console.log('Knockout App got message', page,e);
        var antUI = this,
            rootVM = this.viewModel.rootVM,
            sensorId = page.broadcast.channelId.sensorId,
            deviceType = page.broadcast.channelId.deviceType,
            deviceTypeVM,
            handlerLogger = rootVM.sensorVM.getLogger(),
            currentSeries,

        // Viewmodels - alias

            TemperatureVM = this.viewModel.TemperatureVM,
            HRMVM = this.viewModel.HRMVM,
            FootpodVM = this.viewModel.FootpodVM,
            SPDCADVM = this.viewModel.SPDCADVM;

        deviceTypeVM = this.viewModel.sensorDictionary[sensorId];

        // Refresh viewmodel with new page data from sensor
        if (deviceTypeVM)
            deviceTypeVM.updateFromPage(page);

        switch (deviceType) {

            case 25:
                if (!deviceTypeVM)
                    this.addTemperatureSeries(page);
                else {
                    if (deviceTypeVM instanceof TemperatureVM && page.currentTemp !== undefined) {

                        currentSeries = this.sensorChart.integrated.chart.get('ENVIRONMENT-current-' + sensorId);

                        if (rootVM.settingVM.temperatureMode && rootVM.settingVM.temperatureMode() === TemperatureVM.prototype.MODE.FAHRENHEIT) {
                            currentSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, this.tempConverter.fromCelciusToFahrenheit(page.currentTemp)]);
                        } else {
                            currentSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, page.currentTemp], false,
                                //currentSeries.data.length >= (currentSeries.chart.plotWidth || 1024),
                                false,
                                false);
                        }

                        // Immediate redraw due to slow update frequency (1 minute)
                        // this.redrawIntegratedChart();

                    }
                }

                break;

            case 120:

                if (!deviceTypeVM)
                    this.addHRMSeries(page);
                else {
                    if (deviceTypeVM instanceof HRMVM && page.computedHeartRate !== HRMVM.prototype.INVALID_HR) {
                        currentSeries = this.sensorChart.integrated.chart.get('HRM-current-' + sensorId);
                        currentSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, page.computedHeartRate], false,
                            //currentSeries.data.length >= (currentSeries.chart.plotWidth || 1024),
                             // currentSeries.data.length > 5,
                             false,
                            false);

                        this.processRR(page);

                        // Maybe: use a setInterval redraw that loops all series and check for the first series that has series.isDirty && series.isDirtyData === true -> redraw
                        //if ((Date.now() - this.sensorChart.integrated.lastRedrawTimestamp >= 1000)) {
                        //    this.redrawIntegratedChart();
                        //}

                    }
                }

                break;

            case 121:

                if (!deviceTypeVM)
                    this.addSPDCADSeries(page);
                else {
                    if (deviceTypeVM instanceof SPDCADVM && page.cadence !== undefined) {
                        currentSeries = this.sensorChart.integrated.chart.get('SPDCAD-cadence-' + sensorId);
                        currentSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, page.cadence], false,
                            //currentSeries.data.length >= (currentSeries.chart.plotWidth || 1024),
                             // currentSeries.data.length > 5,
                             false,
                            false);
                    } else if (deviceTypeVM instanceof SPDCADVM && page.unCalibratedSpeed !== undefined) {
                        currentSeries = this.sensorChart.integrated.chart.get('SPDCAD-speed-' + sensorId);
                        currentSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, deviceTypeVM.speed()], false,
                            //currentSeries.data.length >= (currentSeries.chart.plotWidth || 1024),
                             // currentSeries.data.length > 5,
                             false,
                            false);
                    }

                    //if ((Date.now() - this.sensorChart.integrated.lastRedrawTimestamp >= 1000)) {
                    //    this.redrawIntegratedChart();
                    //}
                }

                break;

            case 124:

                if (!deviceTypeVM)
                    this.addFootpodSeries(page);
                else {

                    if (deviceTypeVM instanceof FootpodVM && page.speed !== undefined) {
                        currentSeries = this.sensorChart.integrated.chart.get('footpod-speed-' + sensorId);
                        currentSeries.addPoint([page.timestamp + this.timezoneOffsetInMilliseconds, page.speed], false,
                            //currentSeries.data.length >= (currentSeries.chart.plotWidth || 1024),
                            false,
                            false);


                    }

                    //if ((Date.now() - this.sensorChart.integrated.lastRedrawTimestamp >= 1000)) {
                    //    this.redrawIntegratedChart();
                    //}

                }

                break;

            default:

                handlerLogger.log('warn', "Device type not currently supported, cannot add series on chart for device type ", deviceType);

                break;
        }

    };

    ANTMonitorUI.prototype.getTimezoneOffsetInMilliseconds = function () {
        return (new Date()).getTimezoneOffset() * -60000; // 1000 ms pr second = 60000 ms / minute
    }

    ANTMonitorUI.prototype.startRedrawInterval = function (delay) {
        var redrawHandler = function () {

            var serieNr;

            if (!this.sensorChart)
                return;

            for (serieNr = 0; serieNr < this.sensorChart.integrated.chart.series.length; serieNr++) {

                if (this.sensorChart.integrated.chart.series[serieNr].isDirty && this.sensorChart.integrated.chart.series[serieNr].isDirtyData) {
                    this.redrawIntegratedChart();
                    break;
                }
            }
        }.bind(this);

        var id = setInterval(redrawHandler, delay);

        // to do: maybe use array instead? clearInterval on suspend/shutdown?
        this.timerID.interval[id] = true;
    }

   
    void new ANTMonitorUI();

})();