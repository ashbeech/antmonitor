﻿/* global define: true */

// Main viewmodel class
define(['require', 'module', 'exports', 'logger', 'profiles/Page', 'vm/genericVM'], function (require, module, exports, Logger, GenericPage, GenericVM) {
    'use strict';

    function HRMVM(configuration) {

        GenericVM.call(this, configuration);

        this.timestamp = ko.observable();

        this.formattedTimestamp = ko.computed({
            read: function () {
                if (this.timestamp)
                    return (new Date(this.timestamp())).toLocaleTimeString();
            }.bind(this)
        });

        this._page = undefined;

        this.sensorId = ko.observable();

        this.number = ko.observable();
        
        // HRM page 4 
        
        // Time of the last valid heart beat event 1 /1024 s, rollover 64 second
        this.heartBeatEventTime = ko.observable();
    
        // Counter for each heart beat event, rollover 255 counts
        this.heartBeatCount = ko.observable();
    
        // Intantaneous heart rate, invalid = 0x00, valid = 1-255, can be displayed without further intepretation
        this.computedHeartRate = ko.observable();
        
        this.previousHeartBeatEventTime = ko.observable();
        
        this.RRInterval = ko.observable();

        // HRM page 1

        this.cumulativeOperatingTimeString = ko.observable();
        this.lastBatteryReset = ko.observable();

        // HRM page 2

        this.manufacturerID = ko.observable();
        this.serialNumber = ko.observable();
        this.manufacturerString = ko.observable();

        // HRM page 3

        this.softwareVersion = ko.observable();
        this.hardwareVersion = ko.observable();
        this.modelNumber = ko.observable();

    }

    HRMVM.prototype = Object.create(GenericVM.prototype);
    HRMVM.prototype.constructor = HRMVM;

    HRMVM.prototype.INVALID_HR = 0x00;
    
    HRMVM.prototype.updateFromPage = function (page) {
        
        this._page = page;

        if (page.broadcast && page.broadcast.channelId)
            this.sensorId(page.broadcast.channelId.sensorId);

        if (page.number !== undefined)
            this.number(page.number);

        // HRM Page 4 - main
        
         // Time of the last valid heart beat event 1 /1024 s, rollover 64 second
        if (page.heartBeatEventTime)
            this.heartBeatEventTime(page.heartBeatEventTime);
    
        // Counter for each heart beat event, rollover 255 counts
        if (page.heartBeatCount)
            this.heartBeatCount(page.heartBeatCount);
    
        // Intantaneous heart rate, invalid = 0x00, valid = 1-255, can be displayed without further intepretation
        if (page.computedHeartRate)
            this.computedHeartRate(page.computedHeartRate);
        
        if (page.previousHeartBeatEventTime)
            this.previousHeartBeatEventTime(page.previousHeartBeatEventTime);
        
        if (page.RRInterval)
            this.RRInterval(Math.round(page.RRInterval));

        // HRM page 1 - background

        if (page.cumulativeOperatingTime)
            this.cumulativeOperatingTime(page.cumulativeOperatingTime);

        if (page.cumulativeOperatingTimeString)
            this.cumulativeOperatingTimeString(page.cumulativeOperatingTimeString);

        if (page.lastBatteryReset)
            this.lastBatteryReset(page.lastBatteryReset);

        // HRM page 2 - background

        if (page.manufacturerID)
            this.manufacturerID(page.manufacturerID);

        if (page.serialNumber)
            this.serialNumber(page.serialNumber);

        if (page.manufacturerID && page.serialNumber) {
            if ((page.serialNumber >> 16) === 0)
                this.manufacturerString('Manufacturer ' + page.manufacturerID + ' SN ' + page.serialNumber);
            else
                this.manufacturerString('Manufacturer '+page.manufacturerID +' SN '+ page.serialNumber+' ('+page.broadcast.channelId.deviceNumber+')');
        }

        //if (page.broadcast.channelId && page.broadcast.channelId.deviceNumber)
        //    this.deviceNumber(page.broadcast.channelId.deviceNumber);

        // HRM page 3

        if (page.hardwareVersion)
            this.hardwareVersion(page.hardwareVersion);

        if (page.softwareVersion)
            this.softwareVersion(page.softwareVersion);

        if (page.modelNumber)
            this.modelNumber(page.modelNumber);
    };

    HRMVM.prototype.getTemplateName = function (item) {
        // return undefined;
        return "HRM-template";
    };

    module.exports = HRMVM;
        
    return module.exports;
});