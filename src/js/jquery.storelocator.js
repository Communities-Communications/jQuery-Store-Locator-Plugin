/*
 * storeLocator v1.4.9 - jQuery Google Maps Store Locator Plugin
 * (c) Copyright 2013, Bjorn Holine (http://www.bjornblog.com)
 * Released under the MIT license
 */

/* global define, window, document, Handlebars, google */

;(function ($, window, document, undefined) {
	'use strict';

	var pluginName = "storeLocator";

	// Only allow for one instantiation of this script
	if (typeof $.fn[pluginName] !== 'undefined') {
		return;
	}

	// Variables used across multiple functions		
	var $this, listTemplate, infowindowTemplate, dataTypeRead, originalData, originalDataRequest, originalZoom, searchInput, addressInput, olat, olng, storeNum, directionsDisplay, directionsService;
	var featuredset = [], locationset = [], normalset = [], markers = [];
	var filters = {}, locationData = {}, GeoCodeCalc = {}, mappingObj = {};

	// Create the defaults once. Do not change these settings in this file - settings should be overridden in the plugin call
	var defaults = {
		'mapID'                    : 'bh-sl-map',
		'locationList'             : 'bh-sl-loc-list',
		'formContainer'            : 'bh-sl-form-container',
		'formID'                   : 'bh-sl-user-location',
		'addressID'                : 'bh-sl-address',
		'regionID'                 : 'bh-sl-region',
		'mapSettings'              : {
			zoom     : 12,
			mapTypeId: google.maps.MapTypeId.ROADMAP
		},
		'markerImg'                : null,
		'markerDim'                : null,
		'lengthUnit'               : 'm',
		'storeLimit'               : 26,
		'distanceAlert'            : 60,
		'dataType'                 : 'xml',
		'dataLocation'             : 'data/locations.xml',
		'xmlElement'               : 'marker',
		'listColor1'               : '#ffffff',
		'listColor2'               : '#eeeeee',
		'originMarker'             : false,
		'originMarkerImg'          : null,
		'originMarkerDim'          : null,
		'bounceMarker'             : true,
		'slideMap'                 : true,
		'modal'                    : false,
		'overlay'                  : 'bh-sl-overlay',
		'modalWindow'              : 'bh-sl-modal-window',
		'modalContent'             : 'bh-sl-modal-content',
		'closeIcon'                : 'bh-sl-close-icon',
		'defaultLoc'               : false,
		'defaultLat'               : null,
		'defaultLng'               : null,
		'autoGeocode'              : false,
		'maxDistance'              : false,
		'maxDistanceID'            : 'bh-sl-maxdistance',
		'fullMapStart'             : false,
		'noForm'                   : false,
		'loading'                  : false, //TODO: Add loading back
		'loadingContainer'         : 'bh-sl-loading',
		'featuredLocations'        : false,
		'pagination'               : false,
		'locationsPerPage'         : 10,
		'inlineDirections'         : false,
		'nameSearch'               : false,
		'searchID'                 : 'bh-sl-search',
		'nameAttribute'            : 'name',
		'infowindowTemplatePath'   : 'templates/infowindow-description.html',
		'listTemplatePath'         : 'templates/location-list-description.html',
		'KMLinfowindowTemplatePath': 'templates/kml-infowindow-description.html',
		'KMLlistTemplatePath'      : 'templates/kml-location-list-description.html',
		'listTemplateID'           : null,
		'infowindowTemplateID'     : null,
		'taxonomyFilters'          : null,
		'querystringParams'        : false,
		'callbackBeforeSend'       : null,
		'callbackSuccess'          : null,
		'callbackModalOpen'        : null,
		'callbackModalClose'       : null,
		'jsonpCallback'            : null,
		// Language options
		'geocodeErrorAlert'        : 'Geocode was not successful for the following reason: ',
		'addressErrorAlert'        : 'Unable to find address',
		'autoGeocodeErrorAlert'    : 'Automatic location detection failed. Please fill in your address or zip code.',
		'distanceErrorAlert'       : 'Unfortunately, our closest location is more than ',
		'mileLang'                 : 'mile',
		'milesLang'                : 'miles',
		'kilometerLang'            : 'kilometer',
		'kilometersLang'           : 'kilometers',
		'noResultsTitle'           : 'No results',
		'noResultsDesc'            : 'No locations were found with the given criteria. Please modify your selections or input.'
	};

	// Plugin constructor
	function Plugin(element, options) {
		this.element = element;
		this.settings = $.extend({}, defaults, options);
		this._defaults = defaults;
		this._name = pluginName;
		this.init();
	}

	// Avoid Plugin.prototype conflicts
	$.extend(Plugin.prototype, {
		/**
		 * Reset function
		 */
		reset: function () {
			locationset = [];
			featuredset = [];
			normalset = [];
			markers = [];
			$(document).off('click.'+pluginName, '.' + this.settings.locationList + ' li');
		},
		
		/**
		 * Distance calculations
		 */
		geoCodeCalcToRadian: function (v) {
			return v * (Math.PI / 180);
		},
		geoCodeCalcDiffRadian: function (v1, v2) {
			return this.geoCodeCalcToRadian(v2) - this.geoCodeCalcToRadian(v1);
		},
		geoCodeCalcCalcDistance: function (lat1, lng1, lat2, lng2, radius) {
			return radius * 2 * Math.asin(Math.min(1, Math.sqrt(( Math.pow(Math.sin((this.geoCodeCalcDiffRadian(lat1, lat2)) / 2.0), 2.0) + Math.cos(this.geoCodeCalcToRadian(lat1)) * Math.cos(this.geoCodeCalcToRadian(lat2)) * Math.pow(Math.sin((this.geoCodeCalcDiffRadian(lng1, lng2)) / 2.0), 2.0) ))));
		},
		
		/**
		 * Init function
		 */
		init: function () {
			// Calculate geocode distance functions
			if (this.settings.lengthUnit === 'km') {
				//Kilometers
				GeoCodeCalc.EarthRadius = 6367.0;
			}
			else {
				// Default is miles
				GeoCodeCalc.EarthRadius = 3956.0;
			}

			// KML is read as XML
			if (this.settings.dataType === 'kml') {
				dataTypeRead = 'xml';
			}
			else {
				dataTypeRead = this.settings.dataType;
			}
			
			// Set up the directionsService if it's true
			if(this.settings.inlineDirections === true) {
				directionsDisplay = new google.maps.DirectionsRenderer();
				directionsService = new google.maps.DirectionsService();
				$('.' + this.settings.locationList).prepend('<div class="bh-sl-directions-panel"></div>');
			}

			// Save the original zoom setting so it can be retrieved if taxonomy filtering resets it
			originalZoom = this.settings.mapSettings.zoom;
			
			// Add Handlebars helper for handling URL output
			Handlebars.registerHelper('niceURL', function(url) {
				if(url){
					return url.replace('https://', '').replace('http://', '');
				}
			});

			// Do taxonomy filtering if set
			if (this.settings.taxonomyFilters !== null) {
				this.taxonomyFiltering();
			}

			// Add modal window divs if set
			if (this.settings.modal === true) {
				// Clone the filters if there are any so they can be used in the modal
				if (this.settings.taxonomyFilters !== null) {
					// Clone the filters
					$('.bh-sl-filters-container').clone(true, true).prependTo($this);
				}
			
				$this.wrap('<div class="' + this.settings.overlay + '"><div class="' + this.settings.modalWindow + '"><div class="' + this.settings.modalContent + '">');
				$('.' + this.settings.modalWindow).prepend('<div class="' + this.settings.closeIcon + '"></div>');
				$('.' + this.settings.overlay).hide();
			}
			
			// Load the templates and continue from there
			this.loadTemplates();
		},

		/**
		 * Destroy
		 */
		destroy: function () {
			// Reset
			this.reset();

			// Remove marker event listeners
			if(markers.length) {
				for(var i = 0; i <= markers.length; i++) {
					google.maps.event.removeListener(markers[i]);
				}
			}
			
			// Remove markup
			$('.' + this.settings.locationList + ' ul').empty();
			if($('#' + this.settings.mapID).hasClass('bh-sl-map-open')) {
				$('#' + this.settings.mapID).empty();
				$('#' + this.settings.mapID).removeClass('bh-sl-map-open');
			}
			
			// Remove modal markup
			if (this.settings.modal === true) {
				$('. ' + this.settings.overlay).remove();
			}
			
			// Remove map style from cotnainer
			$('#' + this.settings.mapID).attr('style', '');
			
			// Hide map container
			$this.hide();
			// Remove data
			$.removeData($this.get(0));
			// Remove namespached events
			$(document).off(pluginName);
			// Unbind plugin
			$this.unbind();
		},

		/**
		 * Check for query string
		 * 
		 * @param param {string} query string parameter to test
		 * @returns {string}
		 */
		getQueryString: function(param) {
			param = param.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
			var regex = new RegExp('[\\?&]' + param + '=([^&#]*)'),
					results = regex.exec(location.search);
			return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
		},

		/**
		 * Load templates
		 */
		loadTemplates: function () {
			var source;
			var _this = this;
			// Get the KML templates
			if (this.settings.dataType === 'kml' && this.settings.listTemplateID === null && this.settings.infowindowTemplateID === null) {

				// Try loading the external template files
				$.when(
					// KML infowindows
					$.get(this.settings.KMLinfowindowTemplatePath, function (template) {
						source = template;
						infowindowTemplate = Handlebars.compile(source);
					}),
	
					// KML locations list
					$.get(this.settings.KMLlistTemplatePath, function (template) {
						source = template;
						listTemplate = Handlebars.compile(source);
					})
				).then(function () {
					// Continue to the main script if templates are loaded successfully
					_this.locator();

				}, function () {
					// KML templates not loaded - you can add a console.log here to see if your templates are failing

				});
			}
			// Handle script tag template method
			else if (this.settings.listTemplateID !== null && this.settings.infowindowTemplateID !== null) {
				// Infowindows
				infowindowTemplate = Handlebars.compile($(this.settings.infowindowTemplateID).html());

				// Locations list
				listTemplate = Handlebars.compile($(this.settings.listTemplateID).html());

				// Continue to the main script
				_this.locator();
			}
			// Get the JSON/XML templates
			else {
				// Try loading the external template files
				$.when(
					// Infowindows
					$.get(this.settings.infowindowTemplatePath, function (template) {
						source = template;
						infowindowTemplate = Handlebars.compile(source);
					}),
	
					// Locations list
					$.get(this.settings.listTemplatePath, function (template) {
						source = template;
						listTemplate = Handlebars.compile(source);
					})
				).then(function () {
					// Continue to the main script if templates are loaded successfully
					_this.locator();

				}, function () {
					// JSON/XML templates not loaded - you can add a console.log here to see if your templates are failing

				});
			}
		},

		/**
		 * Primary locator function runs after the templates are loaded
		 */
		locator: function () {
			if (this.settings.slideMap === true) {
				// Let's hide the map container to begin
				$this.hide();
			}

			this.start();
			this.formEventHandler();
		},

		/**
		 * Form event handler setup
		 */
		formEventHandler: function () {
			var _this = this;
			// ASP.net or regular submission?
			if (this.settings.noForm === true) {
				$(document).on('click.'+pluginName, '.' + this.settings.formContainer + ' button', function (e) {
					_this.processForm(e);
				});
				$(document).on('keyup.'+pluginName, function (e) {
					if (e.keyCode === 13 && $('#' + _this.settings.addressID).is(':focus')) {
						_this.processForm(e);
					}
				});
			}
			else {
				$(document).on('submit.'+pluginName, '#' + this.settings.formID, function (e) {
					_this.processForm(e);
				});
			}
		},

		/**
		 * AJAX data request
		 */
		getData: function (lat, lng, address) {
			var d = $.Deferred();
			
			// Before send callback
			if (this.settings.callbackBeforeSend) {
				this.settings.callbackBeforeSend.call(this);
			}

			// AJAX request
			$.ajax({
				type         : 'GET',
				url          : this.settings.dataLocation + (this.settings.dataType === 'jsonp' ? (this.settings.dataLocation.match(/\?/) ? '&' : '?') + 'callback=?' : ''),
				// Passing the lat, lng, and address with the AJAX request so they can optionally be used by back-end languages
				data: {
					'origLat' : lat,
					'origLng' : lng,
					'origAddress': address
				},
				dataType     : dataTypeRead,
				jsonpCallback: (this.settings.dataType === 'jsonp' ? this.settings.jsonpCallback : null)
			}).done(function (p) {
				d.resolve(p);
			}).fail(d.reject);
			return d.promise();
		},

		/**
		 * Count the selected filters
		 *
		 * @returns {number}
		 */
		countFilters: function () {
			var filterCount = 0;

			if (!this.isEmptyObject(filters)) {
				for (var key in filters) {
					if (filters.hasOwnProperty(key)) {
						filterCount += filters[key].length;
					}
				}
			}

			return filterCount;
		},

		/**
		 * Check for existing filter selections
		 */
		checkFilters: function () {
			$.each(this.settings.taxonomyFilters, function (k, v) {
				// Find the existing checked boxes for each checkbox filter
				$(v + ' input[type=checkbox]').each(function () {
					if ($(this).prop('checked')) {
						var filterVal = $(this).attr('id');

						// Only add the taxonomy id if it doesn't already exist
						if (filters[k].indexOf(filterVal) === -1) {
							filters[k].push(filterVal);
						}
					}
				});

				// Find the existing selected value for each select filter
				$(v + ' select').each(function () {
					var filterVal = $(this).attr('id');

					// Only add the taxonomy id if it doesn't already exist
					if (filters[k].indexOf(filterVal) === -1) {
						filters[k].push(filterVal);
					}
				});
			});
		},

		/**
		 * Get the filter key from the taxonomyFilter setting
		 *
		 * @param filterContainer {string} ID of the changed filter's container
		 */
		getFilterKey: function (filterContainer) {
			for (var key in this.settings.taxonomyFilters) {
				if (this.settings.taxonomyFilters.hasOwnProperty(key)) {
					for (var i = 0; i < this.settings.taxonomyFilters[key].length; i++) {
						if (this.settings.taxonomyFilters[key] === filterContainer) {
							return key;
						}
					}
				}
			}
		},

		/**
		 * Checks for default location, full map, and HTML5 geolocation settings
		 */
		start: function () {
			var _this = this;
			// If a default location is set
			if (this.settings.defaultLoc === true) {
				// The address needs to be determined for the directions link
				var r = new this.reverseGoogleGeocode();
				var latlng = new google.maps.LatLng(this.settings.defaultLat, this.settings.defaultLng);
				r.geocode({'latLng': latlng}, function (data) {
					if (data !== null) {
						var originAddress = data.address;
						mappingObj.lat = _this.settings.defaultLat;
						mappingObj.lng = _this.settings.defaultLng;
						mappingObj.origin = originAddress;
						_this.mapping(mappingObj);
					} else {
						// Unable to geocode
						alert(_this.settings.addressErrorAlert);
					}
				});
			}

			// If show full map option is true
			if (this.settings.fullMapStart === true) {
				if(this.settings.querystringParams === true && this.getQueryString(this.settings.addressID) || this.getQueryString(this.settings.searchID)) {
					this.processForm();
				}
				else {
					this.mapping();
				}
			}

			// HTML5 geolocation API option
			if (this.settings.autoGeocode === true) {
				if (navigator.geolocation) {
					navigator.geolocation.getCurrentPosition(function(position){
						// Have to do this to get around scope issues
						_this.autoGeocodeQuery(position);
					}, function(error){
						_this.autoGeocodeError(error);
					});
				}
			}
		},

		/**
		 * Geocode function used to geocode the origin (entered location)
		 */
		googleGeocode: function () {
			var _this = this;
			var geocoder = new google.maps.Geocoder();
			this.geocode = function (request, callbackFunction) {
				geocoder.geocode(request, function (results, status) {
					if (status === google.maps.GeocoderStatus.OK) {
						var result = {};
						result.latitude = results[0].geometry.location.lat();
						result.longitude = results[0].geometry.location.lng();
						callbackFunction(result);
					} else {
						alert(_this.settings.geocodeErrorAlert + status);
						callbackFunction(null);
					}
				});
			};
		},

		/**
		 * Reverse geocode to get address for automatic options needed for directions link
		 */
		reverseGoogleGeocode: function () {
			var _this = this;
			var geocoder = new google.maps.Geocoder();
			this.geocode = function (request, callbackFunction) {
				geocoder.geocode(request, function (results, status) {
					if (status === google.maps.GeocoderStatus.OK) {
						if (results[0]) {
							var result = {};
							result.address = results[0].formatted_address;
							callbackFunction(result);
						}
					} else {
						alert(_this.settings.geocodeErrorAlert + status);
						callbackFunction(null);
					}
				});
			};
		},

		/**
		 * Rounding function used for distances
		 *
		 * @param num {number} the full number
		 * @param dec {number} the number of digits to show after the decimal
		 * @returns {number}
		 */
		roundNumber: function (num, dec) {
			return Math.round(num * Math.pow(10, dec)) / Math.pow(10, dec);
		},

		/**
		 * Checks to see if the object is empty. Using this instead of $.isEmptyObject for legacy browser support
		 *
		 * @param obj {object} the object to check
		 * @returns {boolean}
		 */
		isEmptyObject: function (obj) {
			for (var key in obj) {
				if (obj.hasOwnProperty(key)) {
					return false;
				}
			}
			return true;
		},

		/**
		 * Modal window close function
		 */
		modalClose: function () {
			// Callback
			if (this.settings.callbackModalOpen) {
				this.settings.callbackModalOpen.call(this);
			}
			
			// Reset the filters
			filters = {};
			
			// Undo category selections
			$('.' + this.settings.overlay + ' select').prop('selectedIndex', 0);
			$('.' + this.settings.overlay + ' input').prop('checked', false);

			// Hide the modal
			$('.' + this.settings.overlay).hide();
		},

		/**
		 * Create the location variables
		 *
		 * @param loopcount {number} current marker id
		 */
		createLocationVariables: function (loopcount) {
			var value;

			for (var key in locationset[loopcount]) {
				if (locationset[loopcount].hasOwnProperty(key)) {
					value = locationset[loopcount][key];

					if (key === 'distance') {
						value = this.roundNumber(value, 2);
					}

					locationData[key] = value;
				}
			}
		},

		/**
		 * Location distance sorting function
		 *
		 * @param locationsarray {array} locationset array
		 */
		sortNumerically: function (locationsarray) {
			locationsarray.sort(function (a, b) {
				return ((a.distance < b.distance) ? -1 : ((a.distance > b.distance) ? 1 : 0));
			});
		},

		/**
		 * Filter the data with Regex
		 *
		 * @param data
		 * @param filters
		 * @returns {boolean}
		 */
		filterData: function (data, filters) {
			var filterTest = true;

			for (var k in filters) {
				if (!(new RegExp(filters[k].join(''), 'i').test(data[k]))) {
					filterTest = false;
				}
			}

			if (filterTest) {
				return true;
			}
		},

		/**
		 * Build pagination numbers and next/prev links
		 *
		 * @param currentPage {number}
		 * @param totalPages {number}
		 * @returns {string}
		 */
		paginationOutput: function(currentPage, totalPages) {
			currentPage = parseFloat(currentPage);
			var output = '';
			var nextPage = currentPage + 1;
			var prevPage = currentPage - 1;

			// Previous page
			if( currentPage > 0 ) {
				output += '<li class="bh-sl-next-prev" data-page="' + prevPage + '">&laquo; Prev</li>';
			}

			// Add the numbers
			for (var p = 0; p < totalPages; p++) {
				var n = p + 1;

				if (p === currentPage) {
					output += '<li class="bh-sl-current" data-page="' + p + '">' + n + '</li>';
				}
				else {
					output += '<li data-page="' + p + '">' + n + '</li>';
				}
			}

			// Next page
			if( nextPage < totalPages ) {
				output += '<li class="bh-sl-next-prev" data-page="' + nextPage + '">Next &raquo;</li>';
			}

			return output;
		},

		/**
		 * Set up the pagination pages
		 *
		 * @param currentPage {number} optional current page
		 */
		paginationSetup: function (currentPage) {
			var pagesOutput = '';
			var totalPages = locationset.length / this.settings.locationsPerPage;

			// Current page check
			if (typeof currentPage === 'undefined') {
				currentPage = 0;
			}

			// Initial pagination setup
			if ($('.bh-sl-pagination-container .bh-sl-pagination').length === 0) {

				pagesOutput = this.paginationOutput(currentPage, totalPages);
			}
			// Update pagination on page change
			else {
				// Remove the old pagination
				$('.bh-sl-pagination-container .bh-sl-pagination').empty();

				// Add the numbers
				pagesOutput = this.paginationOutput(currentPage, totalPages);
			}

			//TODO: Target this better
			$('.bh-sl-pagination-container .bh-sl-pagination').append(pagesOutput);
		},

		/**
		 * Map marker setup
		 *
		 * @param point
		 * @param name
		 * @param address
		 * @param letter
		 * @returns {google.maps.Marker}
		 */
		createMarker: function (point, name, address, letter, map) {
			var marker, markerImg, letterMarkerImg;

			if(this.settings.markerImg !== null) {
				if(this.settings.markerDim !== null) {
					markerImg = new google.maps.MarkerImage(this.settings.markerImg, null, null, null, new google.maps.Size(this.settings.markerDim.width,this.settings.markerDim.height));
				}
				else {
					markerImg = new google.maps.MarkerImage(this.settings.markerImg, null, null, null, new google.maps.Size(32,32));
				}
			}

			// Create the default markers
			if (this.settings.storeLimit === -1 || this.settings.storeLimit > 26) {
				marker = new google.maps.Marker({
					position : point,
					map      : map,
					draggable: false,
					icon: markerImg // Reverts to default marker if nothing is passed
				});
			}
			else {
				// Letter markers image
				letterMarkerImg = new google.maps.MarkerImage('https://mt.googleapis.com/vt/icon/name=icons/spotlight/spotlight-waypoint-b.png&text=' + letter + '&psize=16&font=fonts/Roboto-Regular.ttf&color=ff333333&ax=44&ay=48');
				
				// Letter markers
				marker = new google.maps.Marker({
					position : point,
					map      : map,
					icon     : letterMarkerImg,
					draggable: false
				});
			}

			return marker;
		},

		/**
		 * Define the location data for the templates
		 *
		 * @param currentMarker {object} Google Maps marker
		 * @param storeStart {number} optional first location on the current page
		 * @param page {number} optional current page
		 * @returns {{location: *[]}}
		 */
		defineLocationData: function (currentMarker, storeStart, page) {
			var indicator = "";
			this.createLocationVariables(currentMarker.get('id'));

			var distLength;
			if (locationData.distance <= 1) {
				if (this.settings.lengthUnit === 'km') {
					distLength = this.settings.kilometerLang;
				}
				else {
					distLength = this.settings.mileLang;
				}
			}
			else {
				if (this.settings.lengthUnit === 'km') {
					distLength = this.settings.kilometersLang;
				}
				else {
					distLength = this.settings.milesLang;
				}
			}

			// Set up alpha character
			var markerId = currentMarker.get('id');
			// Use dot markers instead of alpha if there are more than 26 locations
			if (this.settings.storeLimit === -1 || this.settings.storeLimit > 26) {
				indicator = markerId + 1;
			}
			else {
				if (page > 0) {
					indicator = String.fromCharCode('A'.charCodeAt(0) + (storeStart + markerId));
				}
				else {
					indicator = String.fromCharCode('A'.charCodeAt(0) + markerId);
				}
			}

			// Define location data
			return {
				location: [$.extend(locationData, {
					'markerid': markerId,
					'marker'  : indicator,
					'length'  : distLength,
					'origin'  : addressInput
				})]
			};
		},

		/**
		 * Set up the list templates
		 *
		 * @param marker {object} Google Maps marker
		 * @param storeStart {number} optional first location on the current page
		 * @param page {number} optional current page
		 */
		listSetup: function (marker, storeStart, page) {
			// Define the location data
			var locations = this.defineLocationData(marker, storeStart, page);

			// Set up the list template with the location data
			var listHtml = listTemplate(locations);
			$('.' + this.settings.locationList + ' ul').append(listHtml);
		},

		// Infowindows
		createInfowindow: function (marker, location, infowindow, storeStart, page) {
			var _this = this;
			// Define the location data
			var locations = this.defineLocationData(marker, storeStart, page);

			// Set up the infowindow template with the location data
			var formattedAddress = infowindowTemplate(locations);

			// Opens the infowindow when list item is clicked
			if (location === 'left') {
				infowindow.setContent(formattedAddress);
				infowindow.open(marker.get('map'), marker);
			}
			// Opens the infowindow when the marker is clicked
			else {
				google.maps.event.addListener(marker, 'click', function () {
					infowindow.setContent(formattedAddress);
					infowindow.open(marker.get('map'), marker);
					// Focus on the list
					$('.' + _this.settings.locationList + ' li').removeClass('list-focus');
					var markerId = marker.get('id');
					$('.' + _this.settings.locationList + ' li[data-markerid=' + markerId + ']').addClass('list-focus');

					// Scroll list to selected marker
					var container = $('.' + _this.settings.locationList), scrollTo = $('.' + _this.settings.locationList + ' li[data-markerid=' + markerId + ']');
					$('.' + _this.settings.locationList).animate({
						scrollTop: scrollTo.offset().top - container.offset().top + container.scrollTop()
					});
				});
			}
		},

		/**
		 * HTML5 geocoding function for automatic location detection
		 */
		autoGeocodeQuery: function (position) {
			var _this = this;
			var mappingObj = {};
			// The address needs to be determined for the directions link
			var r = new this.reverseGoogleGeocode();
			var latlng = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
			r.geocode({'latLng': latlng}, function (data) {
				if (data !== null) {
					var originAddress = data.address;
					mappingObj.lat = position.coords.latitude;
					mappingObj.lng = position.coords.longitude;
					mappingObj.origin = originAddress;
					_this.mapping(mappingObj);
				} else {
					// Unable to geocode
					alert(this.settings.addressErrorAlert);
				}
			});
		},

		/**
		 * Handle autoGeocode failure
		 *
		 * @param error
		 */
		autoGeocodeError: function (error) {
			// If automatic detection doesn't work show an error
			alert(this.settings.autoGeocodeErrorAlert);
		},

		/**
		 * Change the page
		 *
		 * @param newPage
		 */
		paginationChange: function (newPage) {

			mappingObj.page = newPage;
			this.mapping(mappingObj);
		},

		/**
		 * Get the address by marker ID
		 * 
		 * @param markerID {number} location ID
		 * @returns {string} Formatted address
		 */
		getAddressByMarker: function(markerID) {
			var formattedAddress = null;
			// Set up formatted address
			if(locationset[markerID].address){ formattedAddress += locationset[markerID].address + ' '; }
			if(locationset[markerID].address2){ formattedAddress += locationset[markerID].address2 + ' '; }
			if(locationset[markerID].city){ formattedAddress += locationset[markerID].city + ', '; }
			if(locationset[markerID].state){ formattedAddress += locationset[markerID].state + ' '; }
			if(locationset[markerID].postal){ formattedAddress += locationset[markerID].postal + ' '; }
			if(locationset[markerID].country){ formattedAddress += locationset[markerID].country + ' '; }
			
			return formattedAddress;
		},

		/**
		 * Clear the markers from the map
		 */
		clearMarkers: function() {
			for (var i = 0; i < locationset.length; i++) {
				markers[i].setMap(null);
			}
		},

		/**
		 * Handle inline direction requests
		 * 
		 * @param origin {string} origin address
		 * @param locID {number} location ID
		 * @param map
		 */
		directionsRequest: function(origin, locID, map) {
			var destination = this.getAddressByMarker(locID);

			if(destination) {
				// Hide the location list
				$('.' + this.settings.locationList + ' ul').hide();
				// Remove the markers
				this.clearMarkers();

				// Directions request
				directionsDisplay.setMap(map);
				directionsDisplay.setPanel($('.bh-sl-directions-panel').get(0));

				var request = {
					origin: origin,
					destination: destination,
					travelMode: google.maps.TravelMode.DRIVING
				};
				directionsService.route(request, function(response, status) {
					if (status === google.maps.DirectionsStatus.OK) {
						directionsDisplay.setDirections(response);
					}
				});

				$('.' + this.settings.locationList).prepend('<div class="bh-sl-close-directions-container"><div class="' + this.settings.closeIcon + '"></div></div>');
			}

			$(document).off('click', '.' + this.settings.locationList + ' li .loc-directions a');
		},

		/**
		 * Close the directions panel and reset the map with the original locationset and zoom
		 */
		closeDirections: function() {
			// Remove the close icon, remove the directions, add the list back
			$('.bh-sl-close-directions-container').remove();
			$('.' + this.settings.locationList + ' .adp').remove();
			$('.' + this.settings.locationList + ' ul').fadeIn();
			
			this.reset();
			
			if ((olat) && (olng)) {
				if (this.countFilters() === 0) {
					this.settings.mapSettings.zoom = originalZoom;
				}
				else {
					this.settings.mapSettings.zoom = 0;
				}
				this.processForm(null);
			}

			$(document).off('click.'+pluginName, '.' + this.settings.locationList + ' .bh-sl-close-icon');
		},

		/**
		 * Process the form values and/or query string
		 *
		 * @param e {event}
		 */
		processForm: function (e) {
			var _this = this;
			var distance = null;

			// Stop the form submission
			if(typeof e !== 'undefined') {
				e.preventDefault();
			}

			// Get the distance if set
			if (this.settings.maxDistance === true) {
				distance = $('#' + this.settings.maxDistanceID).val();
			}

			if(this.settings.querystringParams === true) {

				// Check for query string parameters
				if(this.getQueryString(this.settings.addressID) || this.getQueryString(this.settings.searchID)){
					addressInput = this.getQueryString(this.settings.addressID);
					searchInput = this.getQueryString(this.settings.searchID);
				}
				else{
					// Get the user input and use it
					addressInput = $('#' + this.settings.addressID).val();
					searchInput = $('#' + this.settings.searchID).val();
				}
			}
			else {
				// Get the user input and use it
				addressInput = $('#' + this.settings.addressID).val();
				searchInput = $('#' + this.settings.searchID).val();
			}

			// Get the region setting if set
			var region = $('#' + this.settings.regionID).val();

			if (addressInput === '' && searchInput === '') {
				this.start();
			}
			else if(addressInput !== '') {
				var g = new this.googleGeocode();
				g.geocode({'address': addressInput, 'region': region}, function (data) {
					if (data !== null) {
						olat = data.latitude;
						olng = data.longitude;

						// Run the mapping function
						mappingObj.lat = olat;
						mappingObj.lng = olng;
						mappingObj.origin = addressInput;
						mappingObj.name = searchInput;
						mappingObj.distance = distance;
						_this.mapping(mappingObj);
					} else {
						// Unable to geocode
						alert(this.settings.addressErrorAlert);
					}
				});
			}
			else if(searchInput !== '') {
				mappingObj.name = searchInput;
				_this.mapping(mappingObj);
			}
		},

		/**
		 * The primary mapping function that runs everything
		 *
		 * @param data {kml,xml,or json} all location data
		 * @param orig_lat {number} origin latitude
		 * @param orig_lng {number} origin longitude
		 * @param origin {string} origin address
		 * @param maxDistance {number} optional maximum distance
		 */
		mapping: function (mappingObject) {
			var _this = this;
			var orig_lat, orig_lng, origin, name, maxDistance, page, firstRun, marker, bounds, storeStart, storeNumToShow, myOptions, noResults;
			var i = 0;
			if (!this.isEmptyObject(mappingObject)) {
				orig_lat = mappingObject.lat;
				orig_lng = mappingObject.lng;
				origin = mappingObject.origin;
				name = mappingObject.name;
				maxDistance = mappingObject.distance;
				page = mappingObject.page;
			}
			
			// Enable the visual refresh https://developers.google.com/maps/documentation/javascript/basics#VisualRefresh
			google.maps.visualRefresh = true;

			// Set the initial page to zero if not set
			if (typeof page === 'undefined') {
				page = 0;
			}

			// Data request
			if (typeof origin === 'undefined' && this.settings.nameSearch === true) {
				originalDataRequest = _this.getData();
			}
			else {
				// Setup the origin point
				var originPoint = new google.maps.LatLng(orig_lat, orig_lng);
				
				// Do the initial data request - doing this in mapping so the lat/lng and address can be passed over and used if needed
				originalDataRequest = _this.getData(olat, olng, origin);
			}

			// Save data separately so we can avoid multiple AJAX requests
			originalDataRequest.done(function (data) {
				// Success callback
				if (_this.settings.callbackSuccess) {
					_this.settings.callbackSuccess.call(this);
				}

				originalData = data;
			});

			/**
			 * Process the location data
			 */
			originalDataRequest.then(function (data) {
				// Callback
				if (_this.settings.callbackSuccess) {
					_this.settings.callbackSuccess.call(this);
				}

				// Set a variable for fullMapStart so we can detect the first run
				if (_this.settings.fullMapStart === true && $('#' + _this.settings.mapID).hasClass('bh-sl-map-open') === false) {
					firstRun = true;
				}
				else {
					_this.reset();
				}

				$('#' + _this.settings.mapID).addClass('bh-sl-map-open');

				// Process the location data depending on the data format type
				if (_this.settings.dataType === 'json' || _this.settings.dataType === 'jsonp') {
					// Process JSON
					$.each(data, function () {
						var key, value, locationData = {};

						// Parse each data variable
						for (key in this) {
							if (this.hasOwnProperty(key)) {
								value = this[key];

								locationData[key] = value;
							}
						}

						if (typeof origin !== 'undefined') {
							if (!locationData.distance) {
								locationData.distance = _this.geoCodeCalcCalcDistance(orig_lat, orig_lng, locationData.lat, locationData.lng, GeoCodeCalc.EarthRadius);
							}
						}

						// Create the array
						if (_this.settings.maxDistance === true && firstRun !== true && maxDistance !== null) {
							if (locationData.distance < maxDistance) {
								locationset[i] = locationData;
							}
							else {
								return;
							}
						}
						else {
							locationset[i] = locationData;
						}

						i++;
					});
				}
				else if (_this.settings.dataType === 'kml') {
					// Process KML
					$(data).find('Placemark').each(function () {
						var locationData = {
							'name'       : $(this).find('name').text(),
							'lat'        : $(this).find('coordinates').text().split(',')[1],
							'lng'        : $(this).find('coordinates').text().split(',')[0],
							'description': $(this).find('description').text()
						};

						if (typeof origin !== 'undefined') {
							if (!locationData.distance) {
								locationData.distance = _this.geoCodeCalcCalcDistance(orig_lat, orig_lng, locationData.lat, locationData.lng, GeoCodeCalc.EarthRadius);
							}
						}

						// Create the array
						if (_this.settings.maxDistance === true && firstRun !== true && maxDistance) {
							if (locationData.distance < maxDistance) {
								locationset[i] = locationData;
							}
							else {
								return;
							}
						}
						else {
							locationset[i] = locationData;
						}

						i++;
					});
				}
				else {
					// Process XML
					$(data).find(_this.settings.xmlElement).each(function () {
						var locationData = {};

						$.each(this.attributes, function (i, attrib) {
							locationData[attrib.name] = attrib.value;
						});

						if (typeof origin !== 'undefined') {
							if (!locationData.distance) {
								locationData.distance = _this.geoCodeCalcCalcDistance(orig_lat, orig_lng, locationData.lat, locationData.lng, GeoCodeCalc.EarthRadius);
							}
						}

						// Create the array
						if (_this.settings.maxDistance === true && firstRun !== true && maxDistance) {
							if (locationData.distance < maxDistance) {
								locationset[i] = locationData;
							}
							else {
								return;
							}
						}
						else {
							locationset[i] = locationData;
						}

						i++;
					});
				}
				
				// Name search - using taxonomy filter to handle
				if (_this.settings.nameSearch === true) {
					if(typeof searchInput !== 'undefined') {
							filters[_this.settings.nameAttribute] = [searchInput];
					}
				}

				// Taxonomy filtering setup
				if (_this.settings.taxonomyFilters !== null || _this.settings.nameSearch === true) {
					var taxFilters = {};
					
					$.each(filters, function (k, v) {
						if (v.length > 0) {
							// Let's use regex
							for (var z = 0; z < v.length; z++) {
								// Creating a new object so we don't mess up the original filters
								if (!taxFilters[k]) {
									taxFilters[k] = [];
								}
								taxFilters[k][z] = '(?=.*\\b' + v[z].replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1") + '\\b)';
							}
						}
					});

					// Filter the data
					if (!_this.isEmptyObject(taxFilters)) {
						var filteredset = $.grep(locationset, function (val, i) {
							return _this.filterData(val, taxFilters);
						});

						locationset = filteredset;
					}
				}

				if (_this.isEmptyObject(locationset)) {
					// Hide the map and locations if they're showing
					if ($('#' + _this.settings.mapID).hasClass('bh-sl-map-open')) {
						$this.hide();
					}

					// Append the no rsults message
					noResults = $('<li><div class="bh-sl-noresults-title">' + _this.settings.noResultsTitle +  '</div><br><div class="bh-sl-noresults-desc">' + _this.settings.noResultsDesc + '</li>').hide().fadeIn();
					
					// Setup a no results location
					locationset[0] = {
						'distance': 0,
						'lat' : 0,
						'lng': 0
					};
				}

				// Sort the multi-dimensional array by distance
				if (typeof origin !== 'undefined') {
					_this.sortNumerically(locationset);
				}

				// Featured locations filtering
				if (_this.settings.featuredLocations === true) {
					// Create array for featured locations
					featuredset = $.grep(locationset, function (val, i) {
						return val.featured === 'true';
					});

					// Create array for normal locations
					normalset = $.grep(locationset, function (val, i) {
						return val.featured !== 'true';
					});

					// Combine the arrays
					locationset = [];
					locationset = featuredset.concat(normalset);
				}

				// Get the length unit
				var distUnit = (_this.settings.lengthUnit === 'km') ? _this.settings.kilometersLang : _this.settings.milesLang;

				// Check the closest marker
				if (_this.settings.maxDistance === true && firstRun !== true && maxDistance) {
					if (typeof locationset[0] === 'undefined' || locationset[0].distance > maxDistance) {
						alert(_this.settings.distanceErrorAlert + maxDistance + ' ' + distUnit);
						return;
					}
				}
				else {
					if (_this.settings.distanceAlert !== -1 && locationset[0].distance > _this.settings.distanceAlert) {
						alert(_this.settings.distanceErrorAlert + _this.settings.distanceAlert + ' ' + distUnit);
					}
				}

				// Output page numbers if pagination setting is true
				if (_this.settings.pagination === true) {
					_this.paginationSetup(page);
				}

				// Slide in the map container
				if (_this.settings.slideMap === true) {
					$this.slideDown();
				}
				// Set up the modal window
				if (_this.settings.modal === true) {
					// Callback
					if (_this.settings.callbackModalOpen) {
						_this.settings.callbackModalOpen.call(this);
					}

					// Pop up the modal window
					$('.' + _this.settings.overlay).fadeIn();
					// Close modal when close icon is clicked and when background overlay is clicked
					$(document).on('click.'+pluginName, '.' + _this.settings.closeIcon + ', .' + _this.settings.overlay, function () {
						_this.modalClose();
					});
					// Prevent clicks within the modal window from closing the entire thing
					$(document).on('click.'+pluginName, '.' + _this.settings.modalWindow, function (e) {
						e.stopPropagation();
					});
					// Close modal when escape key is pressed
					$(document).on('keyup.'+pluginName, function (e) {
						if (e.keyCode === 27) {
							_this.modalClose();
						}
					});
				}

				// Avoid error if number of locations is less than the default of 26
				if (_this.settings.storeLimit === -1 || (locationset.length ) < _this.settings.storeLimit) {
					storeNum = locationset.length;
				}
				else {
					storeNum = _this.settings.storeLimit;
				}

				// If pagination is on, change the store limit to the setting and slice the locationset array
				if (_this.settings.pagination === true) {
					storeNumToShow = _this.settings.locationsPerPage;
					storeStart = page * _this.settings.locationsPerPage;

					locationset = locationset.slice(storeStart, storeStart + storeNumToShow);
					storeNum = locationset.length;
				}
				else {
					storeNumToShow = storeNum;
					storeStart = 0;
				}

				// Google maps settings
				if ((_this.settings.fullMapStart === true && firstRun === true) || (_this.settings.mapSettings.zoom === 0) || (typeof origin === 'undefined')) {
					myOptions = _this.settings.mapSettings;
					bounds = new google.maps.LatLngBounds();
				}
				else if (_this.settings.pagination === true) {
					// Update the map to focus on the first point in the new set
					var nextPoint = new google.maps.LatLng(locationset[0].lat, locationset[0].lng);

					if (page === 0) {
						_this.settings.mapSettings.center = originPoint;
						myOptions = _this.settings.mapSettings;
					}
					else {
						_this.settings.mapSettings.center = nextPoint;
						myOptions = _this.settings.mapSettings;
					}
				}
				else {
					_this.settings.mapSettings.center = originPoint;
					myOptions = _this.settings.mapSettings;
				}

				var map = new google.maps.Map(document.getElementById(_this.settings.mapID), myOptions);
				// Load the map
				$this.data(_this.settings.mapID.replace('#'), map);

				// Initialize the infowondow
				var infowindow = new google.maps.InfoWindow();

				// Add origin marker if the setting is set
				if (_this.settings.originMarker === true) {
					var originImg = '';
					
					// If fullMapStart is on and it's the first run there is no origin
					if(_this.settings.fullMapStart === false && firstRun === true) {
						return;
					}
					else{
						if(_this.settings.originMarkerImg !== null) {
							if(_this.settings.originMarkerDim !== null) {
								originImg = new google.maps.MarkerImage(_this.settings.originMarkerImg, null, null, null, new google.maps.Size(_this.settings.originMarkerDim.width,_this.settings.originMarkerDim.height));
							}
							else {
								originImg = new google.maps.MarkerImage(_this.settings.originMarkerImg);
							}
						}
						else {
							originImg = new google.maps.MarkerImage('https://mt.googleapis.com/vt/icon/name=icons/spotlight/spotlight-waypoint-a.png');
						}

						marker = new google.maps.Marker({
							position : originPoint,
							map      : map,
							icon     : originImg,
							draggable: false
						});
					}
				}

				// Handle pagination
				$(document).on('click.'+pluginName, '.bh-sl-pagination li', function () {
					// Run paginationChange
					_this.paginationChange($(this).attr('data-page'));
				});

				// Inline directions
				if(_this.settings.inlineDirections === true){
					// Open directions
					$(document).on('click.'+pluginName, '.' + _this.settings.locationList + ' li .loc-directions a', function (e) {
						e.preventDefault();
						var locID = $(this).closest('li').attr('data-markerid');
						_this.directionsRequest(origin, locID, map);
					});

					// Close directions
					$(document).on('click.'+pluginName, '.' + _this.settings.locationList + ' .bh-sl-close-icon', function () {
						_this.closeDirections();
					});
				}

				// Add markers and infowindows loop
				for (var y = 0; y <= storeNumToShow - 1; y++) {
					var letter = "";

					if (page > 0) {
						letter = String.fromCharCode('A'.charCodeAt(0) + (storeStart + y));
					}
					else {
						letter = String.fromCharCode('A'.charCodeAt(0) + y);
					}

					var point = new google.maps.LatLng(locationset[y].lat, locationset[y].lng);
					marker = _this.createMarker(point, locationset[y].name, locationset[y].address, letter, map);
					marker.set('id', y);
					markers[y] = marker;
					if ((_this.settings.fullMapStart === true && firstRun === true) || (_this.settings.mapSettings.zoom === 0) || (typeof origin === 'undefined')) {
						bounds.extend(point);
					}
					// Pass variables to the pop-up infowindows
					_this.createInfowindow(marker, null, infowindow, storeStart, page);
				}

				// Center and zoom if no origin or zoom was provided
				if ((_this.settings.fullMapStart === true && firstRun === true) || (_this.settings.mapSettings.zoom === 0) || (typeof origin === 'undefined')) {
					map.fitBounds(bounds);
				}

				// Create the links that focus on the related marker
				$('.' + _this.settings.locationList + ' ul').empty();
				// Check the locationset and continue with the list setup or show no results message
				if(locationset[0].lat === 0 && locationset[0].lng === 0) {
					$('.' + _this.settings.locationList + ' ul').append(noResults);
				}
				else {
					$(markers).each(function (x, marker) {
						var letter = String.fromCharCode('A'.charCodeAt(0) + x);
						var currentMarker = markers[x];
						_this.listSetup(currentMarker, storeStart, page);
					});
				}

				// Handle clicks from the list
				$(document).on('click.'+pluginName, '.' + _this.settings.locationList + ' li', function () {
					var markerId = $(this).data('markerid');

					var selectedMarker = markers[markerId];

					// Focus on the list
					$('.' + _this.settings.locationList + ' li').removeClass('list-focus');
					$('.' + _this.settings.locationList + ' li[data-markerid=' + markerId + ']').addClass('list-focus');

					map.panTo(selectedMarker.getPosition());
					var listLoc = 'left';
					if (_this.settings.bounceMarker === true) {
						selectedMarker.setAnimation(google.maps.Animation.BOUNCE);
						setTimeout(function () {
									selectedMarker.setAnimation(null);
									_this.createInfowindow(selectedMarker, listLoc, infowindow, storeStart, page);
								}, 700
						);
					}
					else {
						_this.createInfowindow(selectedMarker, listLoc, infowindow, storeStart, page);
					}
				});
				
				// Prevent bubbling from list content links
				$(document).on('click.'+pluginName, '.' + _this.settings.locationList + ' li a', function (e) {
					e.stopPropagation();
				});

				// Add the list li background colors - this wil be dropped in a future version in favor of CSS
				$('.' + _this.settings.locationList + ' ul li:even').css('background', _this.settings.listColor1);
				$('.' + _this.settings.locationList + ' ul li:odd').css('background', _this.settings.listColor2);
				
			});
		},

		/**
		 * Taxonomy filtering
		 */
		taxonomyFiltering: function() {
				var _this = this;

				// Set up the filters
				$.each(this.settings.taxonomyFilters, function (k) {
						filters[k] = [];
				});

				// Handle filter updates
				$('.bh-sl-filters-container').on('change.'+pluginName, 'input, select', function (e) {
						e.stopPropagation();

						var filterId, filterContainer, filterKey;

						// Handle checkbox filters
						if ($(this).is('input[type="checkbox"]')) {
								// First check for existing selections
								_this.checkFilters();

								filterId = $(this).val();
								filterContainer = $(this).closest('.bh-sl-filters').attr('id');
								filterKey = _this.getFilterKey(filterContainer);

								if (filterKey) {
										// Add or remove filters based on checkbox values
										if ($(this).prop('checked')) {
												// Add ids to the filter arrays as they are checked
												filters[filterKey].push(filterId);
												if ($('#' + _this.settings.mapID).hasClass('bh-sl-map-open') === true) {
														_this.reset();
														if ((olat) && (olng)) {
																_this.settings.mapSettings.zoom = 0;
																_this.processForm();
														}
														else {
																_this.mapping(mappingObj);
														}
												}
										}
										else {
												// Remove ids from the filter arrays as they are unchecked
												var filterIndex = filters[filterKey].indexOf(filterId);
												if (filterIndex > -1) {
														filters[filterKey].splice(filterIndex, 1);
														if ($('#' + _this.settings.mapID).hasClass('bh-sl-map-open') === true) {
																_this.reset();
																if ((olat) && (olng)) {
																		if (_this.countFilters() === 0) {
																				_this.settings.mapSettings.zoom = originalZoom;
																		}
																		else {
																				_this.settings.mapSettings.zoom = 0;
																		}
																		_this.processForm();
																}
																else {
																		_this.mapping(mappingObj);
																}
														}
												}
										}
								}
						}
						// Handle select or radio filters
						else if ($(this).is('select') || $(this).is('input[type="radio"]')) {
								// First check for existing selections
								_this.checkFilters();

								filterId = $(this).val();
								filterContainer = $(this).closest('.bh-sl-filters').attr('id');
								filterKey = _this.getFilterKey(filterContainer);

								// Check for blank filter on select since default val could be empty
								if (filterId) {
										if (filterKey) {
												filters[filterKey] = [filterId];
												if ($('#' + _this.settings.mapID).hasClass('bh-sl-map-open') === true) {
														_this.reset();
														if ((olat) && (olng)) {
																_this.settings.mapSettings.zoom = 0;
																_this.processForm();
														}
														else {
																_this.mapping(mappingObj);
														}
												}
										}
								}
								// Reset if the default option is selected
								else {
										if (filterKey) {
												filters[filterKey] = [];
										}
										_this.reset();
										if ((olat) && (olng)) {
												_this.settings.mapSettings.zoom = originalZoom;
												_this.processForm();
										}
										else {
												_this.mapping(mappingObj);
										}
								}
						}
				});
		}

	});

	// A really lightweight plugin wrapper around the constructor,
	// preventing against multiple instantiations
	$.fn[ pluginName ] = function (options) {
		this.each(function () {
			$this = $(this);
			if (!$.data(this, "plugin_" + pluginName)) {
				$.data(this, "plugin_" + pluginName, new Plugin(this, options));
			}
		});

		// chain jQuery functions
		return this;
	};


})(jQuery, window, document);