/*
 *  Online TV plugin for Movian Media Center
 *
 *  Copyright (C) 2015-2018 lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function(plugin) {
    var PREFIX = plugin.getDescriptor().id;
    var logo = plugin.path + "logo.png";
    var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36';
    
    function setPageHeader(page, title) {
	page.type = "directory";
	page.contents = "items";
	page.metadata.logo = logo;
	page.metadata.title = new showtime.RichText(title);
    }

    var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';

    function coloredStr(str, color) {
        return '<font color="' + color + '">' + str + '</font>';
    }

    function trim(s) {
        if (s) return s.replace(/(\r\n|\n|\r)/gm, "").replace(/(^\s*)|(\s*$)/gi, "").replace(/[ ]{2,}/gi, " ").replace(/\t/g,'');
        return '';
    }

    var service = plugin.createService(plugin.getDescriptor().title, PREFIX + ":start", "tv", true, logo);

    var settings = plugin.createSettings(plugin.getDescriptor().title, logo, plugin.getDescriptor().title);
    settings.createBool('debug', 'Enable debug logging',  false, function(v) {
        service.debug = v;
    });
    settings.createBool('disableSampleList', "Don't show Sample M3U list", false, function(v) {
        service.disableSampleList = v;
    });
    settings.createBool('disableSampleXMLList', "Don't show Sample XML list", false, function(v) {
        service.disableSampleXMLList = v;
    });
    settings.createBool('disableEPG', "Don't fetch EPG", true, function(v) {
        service.disableEPG = v;
    });
    settings.createString('acestreamIp', "IP address of AceStream Proxy. Enter IP only.",  '192.168.0.93', function(v) {
        service.acestreamIp = v;
    });
    //settings.createAction("cleanFavorites", "Clean My Favorites", function () {
    //    store.list = "[]";
    //    showtime.notify('Favorites has been cleaned successfully', 2);
    //});

    var store = plugin.createStore('favorites', true);
    if (!store.list)
        store.list = "[]";

    var playlists = plugin.createStore('playlists', true);
    if (!playlists.list)
        playlists.list = "[]";

    function addToFavoritesOption(item, link, title, icon) {
        item.link = link;
        item.title = title;
        item.icon = icon;
        item.onEvent("addFavorite", function(item) {
            var entry = showtime.JSONEncode({
                link: encodeURIComponent(this.link),
                title: encodeURIComponent(this.title),
                icon: encodeURIComponent(this.icon)
            });
            store.list = showtime.JSONEncode([entry].concat(eval(store.list)));
            showtime.notify("'" + this.title + "' has been added to My Favorites.", 2);
        }.bind(item));
	item.addOptAction("Add '" + title + "' to My Favorites", "addFavorite");
    }

    var API = 'https://www.googleapis.com/youtube/v3',
        key = "AIzaSyCSDI9_w8ROa1UoE2CNIUdDQnUhNbp9XR4"

    plugin.addURI(PREFIX + ":youtube:(.*)", function(page, title) {
        // search for the channel
        page.loading = true;
        try {
            doc = showtime.httpReq(API + '/search', {
                args: {
                    part: 'snippet',
                    type: 'video',
                    q: unescape(title),
                    maxResults: 1,
                    eventType: 'live',
                    key: key
                }
            }).toString();
            page.redirect('youtube:video:' + showtime.JSONDecode(doc).items[0].id.videoId);
        } catch(err) {
            page.metadata.title = unescape(title);
            page.error("Sorry, can't get channel's link :(");
        }
        page.loading = false;
    });

    plugin.addURI(PREFIX + ":tivix:(.*):(.*)", function(page, url, title) {
        page.loading = true;
        var resp = showtime.httpReq(unescape(url)).toString();
        page.loading = false;
        var re = /file=([\S\s]*?)&/g;
        var match = re.exec(resp);
        if (!match) {
            re = /skin" src="([\S\s]*?)"/g;
            match = re.exec(resp);
        }
        if (!match) {
            re = /<span id="srces" style="display:none">([\S\s]*?)</g;
            match = re.exec(resp);
        }
        while (match) {
            page.loading = true;
            if (showtime.probe(match[1]).result) {
                match = re.exec(resp);
                continue;
            }
            if (match[1].match(/rtmp/))
                var link = unescape(match[1]) + ' swfUrl=http://tivix.co' + resp.match(/data="(.*)"/)[1] + ' pageUrl=' + unescape(url);
            else
                var link = match[1].match('m3u8') ? 'hls:' + unescape(match[1]) : unescape(match[1]);

            page.loading = false;
            page.type = "video";
            page.source = "videoparams:" + showtime.JSONEncode({
                title: unescape(title),
                canonicalUrl: PREFIX + ':tivix:' + url + ':' + title,
                sources: [{
                    url: link
                }],
                no_subtitle_scan: true
            });
            return;
        }

        // try to get youtube link
        match = resp.match(/\.com\/v\/([\S\s]*?)(\?|=)/);
        if (match) {
            page.redirect('youtube:video:' + match[1]);
            return;
        }
        page.metadata.title = unescape(title);
        page.error("Sorry, can't get the link :(");
    });

    plugin.addURI(PREFIX + ":acestream:(.*):(.*)", function(page, id, title) {
        page.type = "video";
        page.source = "videoparams:" + showtime.JSONEncode({
            title: unescape(title),
            canonicalUrl: PREFIX + ':acestream:' + id + ':' + title,
            sources: [{
                url: 'hls:http://' + service.acestreamIp + ':6878/ace/manifest.m3u8?id=' + id.replace('//', '')
            }],
            no_subtitle_scan: true
        });
    });

    plugin.addURI(PREFIX + ":file:(.*):(.*)", function(page, url, title) {
        page.loading = true;
        page.metadata.title = unescape(title);
        var resp = showtime.httpReq('http://' + unescape(url)).toString();
        var match = resp.match(/'file': "([\S\s]*?)"/);
	if (!match || !match.toString().match(/m3u8/)) match = resp.match(/file: "([\S\s]*?)"/);
	if (!match || !match.toString().match(/m3u8/)) match = resp.match(/file": "([\s\S]*?)"/);
        if (!match || !match.toString().match(/m3u8/)) match = resp.match(/hlsURL = '([\S\s]*?)'/); // ntv
        if (!match || !match.toString().match(/m3u8/)) match = resp.match(/url: '([\S\s]*?)'/); // trk ukraine
        if (!match || !match.toString().match(/m3u8/)) match = resp.match(/source: '([\S\s]*?)'/); // donbass tv
        if (!match || !match.toString().match(/m3u8/)) match = resp.match(/source: "([\S\s]*?)"/); // europa tv
	if (!match || !match.toString().match(/m3u8/)) match = resp.match(/src: '([\S\s]*?)'/); // fashion tv
	if (!match || !match.toString().match(/m3u8/)) match = resp.match(/liveurl = "([\s\S]*?)"/); // zvezda
        page.loading = false;
        if (match) {
            page.type = "video";
	    match = match[1].replace(/\\\//g, '/');
	    if (!match.match(/http:/) && !match.match(/https:/)) match = 'http:' + match;
            log(match);
            page.source = "videoparams:" + showtime.JSONEncode({
                title: unescape(title),
                canonicalUrl: PREFIX + ':file:' + url + ':' + title,
                sources: [{
                    url: match.match(/m3u8/) ? 'hls:' + match : match
                }],
                no_subtitle_scan: true
            });
        } else page.error("Sorry, can't get the link :(");
    });

    plugin.addURI(PREFIX + ":ovva:(.*):(.*)", function(page, url, title) {
        page.loading = true;
        page.metadata.title = unescape(title);
        var match = showtime.httpReq('https://' + unescape(url)).toString();
        var json = match.match(/ovva-player","([\s\S]*?)"/);
        if (json) 
            json = JSON.parse(Duktape.dec('base64', json[1]));
        json = showtime.httpReq(json.balancer).toString();
        log(json);
        var match = json.match(/=([\s\S]*?$)/);
        log(match);
        page.loading = false;
        if (match) {
            page.type = "video";
            page.source = "videoparams:" + showtime.JSONEncode({
                title: unescape(title),
                canonicalUrl: PREFIX + ':ovva:' + url + ':' + title,
                sources: [{
                    url: match[1].match(/m3u8/) ? 'hls:' + match[1] : match[1]
                }],
                no_subtitle_scan: true
            });
        } else page.error("Sorry, can't get the link :(");
    });

    var cosmonovaHeadersAreSet = false;
    plugin.addURI(PREFIX + ":cosmonova:(.*):(.*)", function(page, url, title) {
        page.loading = true;
        page.metadata.title = unescape(title);
        if (!cosmonovaHeadersAreSet) {
            plugin.addHTTPAuth('.*cosmonova\\.net\\.ua.*', function(req) {
                req.setHeader('User-Agent', UA);
                req.setHeader('referer', 'http://live-uapershiy.cosmonova.kiev.ua/online.php?width=743&height=417&lang=ua&autostart=0');
            });
            cosmonovaHeadersAreSet = true;
        }
        page.loading = false;
        page.type = "video";
        page.source = "videoparams:" + showtime.JSONEncode({
            title: unescape(title),
            canonicalUrl: PREFIX + ':cosmonova:' + url + ':' + title,
            sources: [{
                url: 'hls:' + unescape(url)
            }],
            no_subtitle_scan: true
        });
    });

    plugin.addURI(PREFIX + ":dailymotion:(.*):(.*)", function(page, url, title) {
        page.loading = true;
        page.metadata.title = unescape(title);
        var resp = showtime.httpReq('http://www.dailymotion.com/embed/video/' + url).toString();
        var match = resp.match(/stream_chromecast_url":"([\S\s]*?)"/);
        page.loading = false;
        if (match) {
            match = match[1].replace(/\\\//g, '/');
            page.type = "video";
            page.source = "videoparams:" + showtime.JSONEncode({
                title: unescape(title),
                canonicalUrl: PREFIX + ':dailymotion:' + url + ':' + title,
                sources: [{
                    url: match.match(/m3u8/) ? 'hls:' + match : match
                }],
                no_subtitle_scan: true
            });
        } else page.error("Sorry, can't get the link :(");
    });

    plugin.addURI(PREFIX + ":euronews:(.*):(.*)", function(page, country, title) {
        page.loading = true;
        page.metadata.title = unescape(title);
	if (country == 'en')
	    country = 'www';
        var json = showtime.JSONDecode(showtime.httpReq('http://' + country + '.euronews.com/api/watchlive.json'));
        json = showtime.JSONDecode(showtime.httpReq(json.url))
	page.loading = false;
        if (json.primary) {
            page.type = "video";
            page.source = "videoparams:" + showtime.JSONEncode({
                title: unescape(title),
                canonicalUrl: PREFIX + ':euronews:' + country + ':' + title,
                sources: [{
                    url: 'hls:' + json.primary
                }],
                no_subtitle_scan: true
            });
        } else
             page.error("Sorry, can't get the link :(");
    });

    plugin.addURI(PREFIX + ":vgtrk:(.*):(.*)", function(page, url, title) {
        page.metadata.title = unescape(title);
        page.loading = true;
        var resp = showtime.httpReq(unescape(url)).toString();
        page.loading = false;
        var match = resp.match(/"auto":"([\S\s]*?)"\}/);
            if (match) {
                page.type = "video";
                page.source = "videoparams:" + showtime.JSONEncode({
                    title: unescape(title),
                    canonicalUrl: PREFIX + ':vgtrk:' + url + ':' + title,
                    sources: [{
                        url: 'hls:' + match[1].replace(/\\/g, '')
                    }],
                    no_subtitle_scan: true
                });
            } else
                 page.error("Sorry, can't get the link :(");
    });

    plugin.addURI(PREFIX + ":ts:(.*):(.*)", function(page, url, title) {
        page.metadata.title = unescape(title);
        var link = "videoparams:" + showtime.JSONEncode({
            title: unescape(title),
            no_fs_scan: true,
            canonicalUrl: PREFIX + ':ts:' + url + ':' + title,
            sources: [{
                url: unescape(url),
                mimetype: 'video/mp2t'
            }],
            no_subtitle_scan: true
        });
        page.type = 'video'
        page.source = link;
    });

    function fill_fav(page) {
	var list = eval(store.list);

        if (!list || !list.toString()) {
           page.error("My Favorites list is empty");
           return;
        }
        var pos = 0;
	for (var i in list) {
	    var itemmd = showtime.JSONDecode(list[i]);
	    var item = page.appendItem(decodeURIComponent(itemmd.link), "video", {
       		title: decodeURIComponent(itemmd.title),
		icon: itemmd.icon ? decodeURIComponent(itemmd.icon) : null,
                description: new showtime.RichText(coloredStr('Link: ', orange) + decodeURIComponent(itemmd.link))
	    });
	    item.addOptAction("Remove '" + decodeURIComponent(itemmd.title) + "' from My Favorites", pos);

	    item.onEvent(pos, function(item) {
		var list = eval(store.list);
		showtime.notify("'" + decodeURIComponent(showtime.JSONDecode(list[item]).title) + "' has been removed from My Favorites.", 2);
	        list.splice(item, 1);
		store.list = showtime.JSONEncode(list);
                page.flush();
                fill_fav(page);
	    });
            pos++;
	}
    }

    // Favorites
    plugin.addURI(PREFIX + ":favorites", function(page) {
        setPageHeader(page, "My Favorites");
        fill_fav(page);
    });

    plugin.addURI(PREFIX + ":indexTivix:(.*):(.*)", function(page, url, title) {
        setPageHeader(page, decodeURIComponent(title));
        var url = prefixUrl = 'http://tivix.co' + decodeURIComponent(url);
        var tryToSearch = true, fromPage = 1, n = 0;

        function loader() {
            if (!tryToSearch) return false;
            page.loading = true;
            var doc = showtime.httpReq(url).toString();
            page.loading = false;
            // 1-title, 2-url, 3-icon
            var re = /<div class="all_tv" title="([\S\s]*?)">[\S\s]*?href="([\S\s]*?)"[\S\s]*?<img src="([\S\s]*?)"/g;
            var match = re.exec(doc);
            while (match) {
                var link = PREFIX + ":tivix:" + escape(match[2]) + ':' + escape(match[1]);
                var icon = 'http://tivix.co' + match[3];
                var item = page.appendItem(link, "video", {
                    title: match[1],
                    icon: icon
                });
                addToFavoritesOption(item, link, match[1], icon);
                n++;
                match = re.exec(doc);
            }
            page.metadata.title = new showtime.RichText(decodeURIComponent(title) + ' (' + n + ')');
            var next = doc.match(/">Вперед<\/a>/);
            if (!next)
                return tryToSearch = false;
            fromPage++;
            url = prefixUrl + 'page/' + fromPage;;
            return true;
        }
        loader();
        page.paginator = loader;
        page.loading = false;
    });

    plugin.addURI(PREFIX + ":tivixStart", function(page) {
        setPageHeader(page, 'Tivix.co');
        page.loading = true;
        var doc = showtime.httpReq('http://tivix.co').toString();
        page.loading = false;
        var re = /<div class="menuuuuuu"([\S\s]*?)<\/div>/g;
        var menus = re.exec(doc);
        var re2 = /<a href="([\S\s]*?)"[\S\s]*?>([\S\s]*?)<\/a>/g;
        while (menus) {
            var submenus = re2.exec(menus[1]);
            while (submenus) {
                page.appendItem(PREFIX + ":indexTivix:" + encodeURIComponent(submenus[1]) + ':' + encodeURIComponent(submenus[2]), "directory", {
	            title: submenus[2]
                });
                submenus = re2.exec(menus[1]);
            }
            menus = re.exec(doc);
            page.appendItem("", "separator");
        }
    });

    var devId = 0;
    if (!devId) 
        devId = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, function(t) {
        var e = 16 * Math.random() | 0, n = "x" == t ? e : 3 & e | 8;
        return n.toString(16)
    });

    plugin.addURI(PREFIX + ":playYoutv:(.*):(.*)", function(page, url, title) {
        page.loading = true;
        page.type = 'video';
        var json = showtime.JSONDecode(showtime.httpReq(unescape(url), {
            headers: {
               'Device-Uuid': devId,
                Host: 'api.youtv.com.ua',
                Origin: 'https://youtv.com.ua',
                Referer: 'https://youtv.com.ua/',
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest'
            }, 
            debug: service.debug
        }));

        var link = 'https:' + json.playback_url;
        
        plugin.addHTTPAuth('.*' + link.replace('http://','').replace('https://','').split(/[/?#]/)[0].replace(/\./g, '\\.') + '.*', function(req) {
            req.setHeader('Referer', 'https://youtv.com.ua/');
            req.setHeader('X-Requested-With', 'ShockwaveFlash/28.0.0.126');
            req.setHeader('User-Agent', UA);
        });
        page.source = "videoparams:" + showtime.JSONEncode({
            title: unescape(title),
            no_fs_scan: true,
            canonicalUrl: PREFIX + ':playYoutv:' + url + ':' + title,
            sources: [{
                url: 'hls:' + link
            }],
            no_subtitle_scan: true
        });
        page.loading = false;
    });

    plugin.addURI(PREFIX + ":youtvStart", function(page) {
        setPageHeader(page, 'Youtv.com.ua');
        page.loading = true;
        var doc = showtime.httpReq('https://youtv.com.ua/api/start', {
            headers: {
                Accept: 'application/vnd.youtv.v3+json',
                'Device-Uuid': devId,
                Host: 'youtv.com.ua',
                Referer: 'https://youtv.com.ua/',
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest'
            }, 
            debug: service.debug
        }).toString();
        log(doc);

        var json = showtime.JSONDecode(showtime.httpReq('https://youtv.com.ua/api/playlist', {
            headers: {
                Accept: 'application/vnd.youtv.v3+json',
                'Device-Uuid': devId,
                Host: 'youtv.com.ua',
                Origin: 'https://youtv.com.ua',
                Referer: 'https://youtv.com.ua/',
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest'
            }, 
            postdata: {},
            debug: service.debug
        }));
        
        for (var i in json.data) {
            var genres = '', first = 1;
            for (var j in json.data[i].categories) {
                if (first) {
                    genres += json.data[i].categories[j].name;
                    first--;
                } else 
                    genres += ', ' + json.data[i].categories[j].name;
            }
            page.appendItem(PREFIX + ':playYoutv:' + escape(json.data[i].sources[0].stream.url) + ':' + escape(json.data[i].name), 'video', {
                title: new showtime.RichText(json.data[i].name),
                genre: genres,
                icon: json.data[i].image
            });
            page.entries++;                          
        }
        page.metadata.title += ' (' + page.entries + ')';
        page.loading = false;
    });

    function showPlaylist(page) {
	var list = eval(playlists.list);

        if (!list || !list.toString()) {
            page.appendPassiveItem("directory", '', {
                title: "You can add your M3U or XML playlist in the right side menu"
            });
        }
        var pos = 0;
	for (var i in list) {
	    var itemmd = showtime.JSONDecode(list[i]);
            if (!itemmd.link.match(/m3u:http/) && !itemmd.link.match(/xml:http/))
                itemmd.link = 'm3u:' + itemmd.link;
	    var item = page.appendItem(itemmd.link + ':' + itemmd.title, "directory", {
       		title: decodeURIComponent(itemmd.title),
		link: decodeURIComponent(itemmd.link)
	    });
	    item.addOptAction("Remove '" + decodeURIComponent(itemmd.title) + "' playlist from the list", pos);
	    item.onEvent(pos, function(item) {
		var list = eval(playlists.list);
		showtime.notify("'" + decodeURIComponent(showtime.JSONDecode(list[item]).title) + "' has been removed from from the list.", 2);
	        list.splice(item, 1);
		playlists.list = showtime.JSONEncode(list);
                page.flush();
                page.redirect(PREFIX + ':start');
	    });
            pos++;
	}
    }

    var m3uItems = [], groups = [], theLastList = '';

    plugin.addURI('m3uGroup:(.*):(.*)', function(page, pl, groupID) {
        setPageHeader(page, decodeURIComponent(groupID));
        if (theLastList != pl)
            readAndParseM3U(page, pl);

        var num = 0;
        for (var i in m3uItems) {
            if (decodeURIComponent(groupID) != m3uItems[i].group)
                continue;
            addItem(page, m3uItems[i].url, m3uItems[i].title, m3uItems[i].logo, '', '', '', m3uItems[i].useragent);
            num++;
        }
        page.metadata.title = decodeURIComponent(groupID) + ' (' + num + ')';
    });

    function readAndParseM3U(page, pl) {
        var tmp = page.metadata.title + '';
        page.loading = true;
        page.metadata.title = 'Downloading M3U list...';
        var m3u = showtime.httpReq(decodeURIComponent(pl)).toString().split('\n');
        theLastList = pl;
        m3uItems = [], groups = [];
        var m3uUrl = '', m3uTitle = '', m3uImage = '', m3uGroup = '';
        var line = '', m3uRegion = '', m3uEpgId = '', m3uUserAgent = '';
        for (var i = 0; i < m3u.length; i++) {
            page.metadata.title = 'Parsing M3U list. Line ' + i + ' of ' + m3u.length;
            line = m3u[i].trim();
            if (line.substr(0, 7) != '#EXTM3U' && line.indexOf(':') < 0 && line.length != 40) continue; // skip invalid lines
            line = showtime.entityDecode(line.replace(/[\u200B-\u200F\u202A-\u202E]/g, ''));
            switch(line.substr(0, 7)) {
                case '#EXTM3U':
                    var match = line.match(/region=(.*)\b/);
                    if (match)
                        m3uRegion = match[1];
                    break;
                case '#EXTINF':
                    var match = line.match(/#EXTINF:.*,(.*)/);
                    if (match)
                        m3uTitle = match[1].trim();
                    match = line.match(/group-title="([\s\S]*?)"/);
                    if (match) {
                        m3uGroup = match[1].trim();
                        if (groups.indexOf(m3uGroup) < 0)
                            groups.push(m3uGroup);
                    }
                    match = line.match(/tvg-logo=["|”]([\s\S]*?)["|”]/);
                    if (match)
                        m3uImage = match[1].trim();
                    match = line.match(/region="([\s\S]*?)"/);
                    if (match)
                        m3uRegion = match[1];
                    if (m3uRegion) {
                        match = line.match(/description="([\s\S]*?)"/);
                        if (match)
                            m3uEpgId = match[1];
                    }
                    break;
                case '#EXTGRP':
                    var match = line.match(/#EXTGRP:(.*)/);
                    if (match) {
                        m3uGroup = match[1].trim();
                        if (groups.indexOf(m3uGroup) < 0)
                            groups.push(m3uGroup);
                    }
                    break;
                default:
                    if (line[0] == '#') {
                        m3uImage = '';
			continue; // skip unknown tags and comments
                    }
                    line = line.replace(/rtmp:\/\/\$OPT:rtmp-raw=/, '');
                    if (line.indexOf(':') == -1 && line.length == 40)
                        line = 'acestream://' + line;
                    if (m3uImage && m3uImage.substr(0, 4) != 'http')
                        m3uImage = line.match(/^.+?[^\/:](?=[?\/]|$)/) + '/' + m3uImage;
                    tmp = line.split('|');
                    if (tmp[1]) {
                        line = tmp[0];
                        tmp = tmp[1].match(/User-Agent=([\s\S]*>?)/);
                        if (tmp) 
                            m3uUserAgent = unescape(tmp[1].replace(/\"/g, ''));
                    }
                    m3uItems.push({
                        title: m3uTitle ? m3uTitle : line,
                        url: line,
                        group: m3uGroup,
                        logo: m3uImage,
                        region: m3uRegion,
                        epgid: m3uEpgId,
                        useragent: m3uUserAgent
                    });
                    m3uUrl = '', m3uTitle = '', m3uImage = '', m3uEpgId = '', m3uUserAgent = '';//, m3uGroup = '';
            }
        }
        page.metadata.title = new showtime.RichText(tmp);
        page.loading = false;
    }

    function addItem(page, url, title, icon, description, genre, epgForTitle, useragent) {
        if (!epgForTitle) epgForTitle = '';
        // try to detect item type
        var match = url.match(/([\s\S]*?):(.*)/);
        var type = 'video';
        if (match && match[1].toUpperCase().substr(0, 4) != 'HTTP' &&
            match[1].toUpperCase().substr(0, 4) != 'RTMP') {
            var link = PREFIX + ':' + match[1] + ":" + escape(match[2]) + ':' + escape(title);
            if (match[1].toUpperCase() == 'M3U') { // the link is m3u list
                var link = 'm3u:' + encodeURIComponent(match[2]) + ":" + escape(title);
                type = 'directory'
            }
            var linkUrl = link;
        } else {
            var link = "videoparams:" + showtime.JSONEncode({
                title: title,
                sources: [{
                    url: url.match(/m3u8/) || url.match(/\.smil/) ? 'hls:' + url : url
                }],
                no_fs_scan: true,
                no_subtitle_scan: true
            });
            var linkUrl = url;
        }
        // get icon from description
        if (!icon && description) {
            icon = description.match(/img src="(\s\S*?)"/)
            if (icon) icon = icon[1];
        }
        if (!linkUrl) {
            var item = page.appendPassiveItem(type, '', {
                title: new showtime.RichText(title + epgForTitle),
                icon: icon ? icon : null,
                genre: genre,
                description: new showtime.RichText(description)
            });
        } else {
            if (useragent) {
                plugin.addHTTPAuth('.*' + url.replace('http://','').replace('https://','').split(/[/?#]/)[0].replace(/\./g, '\\.') + '.*', function(req) {
                    req.setHeader('User-Agent', useragent);
                });
            }
            var item = page.appendItem(link, type, {
                title: new showtime.RichText(title  + epgForTitle),
                icon: icon ? icon : null,
                genre: genre,
                description: new showtime.RichText((linkUrl ? coloredStr('Link: ', orange) + linkUrl : '') +
                    (description ? '\n' + description : ''))
            });
            addToFavoritesOption(item, link, title, icon);
        }
    }

    plugin.addURI('m3u:(.*):(.*)', function(page, pl, title) {
        setPageHeader(page, unescape(title));
        readAndParseM3U(page, pl);

        var num = 0;
        for (var i in groups) {
            page.appendItem('m3uGroup:' + pl + ':' + encodeURIComponent(groups[i]), "directory", {
	        title: groups[i]
            });
            num++;
        }

        for (var i in m3uItems) {
            if (m3uItems[i].group)
                continue;
            var extension = m3uItems[i].url.split('.').pop().toUpperCase();
            if (extension == 'M3U' || extension == 'PHP' && m3uItems[i].url.toUpperCase().substr(0, 4) != 'RTMP') {
                page.appendItem('m3u:' + encodeURIComponent(m3uItems[i].url) + ':' + encodeURIComponent(m3uItems[i].title), "directory", {
                    title: m3uItems[i].title
                });
                num++;
            } else {
                var description = '';
                if (m3uItems[i].region && m3uItems[i].epgid)
                    description = getEpg(m3uItems[i].region, m3uItems[i].epgid);
                addItem(page, m3uItems[i].url, m3uItems[i].title, m3uItems[i].logo, description, '', epgForTitle, m3uItems[i].useragent);
                epgForTitle = '';
                num++;
            }
        }
        page.metadata.title = new showtime.RichText(unescape(title) + ' (' + num + ')');
    });

    var XML = require('showtime/xml');

    function setColors(s) {
        if (!s) return '';
        return s.toString().replace(/="##/g, '="#').replace(/="lime"/g,
            '="#32CD32"').replace(/="aqua"/g, '="#00FFFF"').replace(/='green'/g,
            '="#00FF00"').replace(/='cyan'/g, '="#00FFFF"').replace(/="LightSalmon"/g,
            '="#ffa07a"').replace(/="PaleGoldenrod"/g, '="#eee8aa"').replace(/="Aquamarine"/g,
            '="#7fffd4"').replace(/="LightSkyBlue"/g, '="#87cefa"').replace(/="palegreen"/g,
            '="#98fb98"').replace(/="yellow"/g, '="#FFFF00"').replace(/font color=""/g, 'font color="#FFFFFF"');
    }

    plugin.addURI(PREFIX + ':parse:(.*):(.*)', function(page, parser, title) {
        setPageHeader(page, unescape(title));
        page.loading = true;
        var n = 1;
        log('Parser is: ' + unescape(parser));
        var params = unescape(parser).split('|');
        log('Requesting: ' + params[0]);
        if (!params[0]) {
            page.error('The link is empty');
            return;
        }
        var html = showtime.httpReq(params[0]).toString();
        var base_url = params[0].match(/^.+?[^\/:](?=[?\/]|$)/);
        if (params.length > 1) {
            var start = html.indexOf(params[1]) + params[1].length;
            var length = html.indexOf(params[2], start) - start;
            var url = html.substr(start, length).split(',');
            log('Found URL: ' + url);
            //var urlCheck = params[1].replace(/\\\//g, '/') + url + params[2].replace(/\\\//g, '/');
            //if (urlCheck.match(/(http.*)/))
            //    url = urlCheck.match(/(http.*)/)[1];
            if (!url[0].trim()) {
                url = html.match(/pl:"([\s\S]*?)"/)[1];
                log('Fetching URL from pl: ' + url);
                var json = showtime.JSONDecode(showtime.httpReq(url));
            } else if (url[0].trim().substr(0, 4) != 'http') {
                if (url[0][0] == '/') {
                    page.appendItem(base_url + url[0], 'video', {
                        title: new showtime.RichText(unescape(title))
                    });
                } else {
                    url = url[0].match(/value="([\s\S]*?)"/);
                    if (url) {
                        url = url[1];
                        log('Fetching URL from value: ' + url);
                        var json = showtime.JSONDecode(showtime.httpReq(url));
                        log(showtime.JSONEncode(json));
                        for (var i in json.playlist) {
                            if (json.playlist[i].file) {
                                page.appendItem(json.playlist[i].file.split(' ')[0], 'video', {
                                    title: new showtime.RichText(json.playlist[i].comment)
                                });
                            }
                            for (var j in json.playlist[i].playlist) {
                                //log(json.playlist[i].playlist[j].comment);
                                page.appendItem(json.playlist[i].playlist[j].file.split(' ')[0], 'video', {
                                    title: new showtime.RichText(json.playlist[i].comment + ' - ' + json.playlist[i].playlist[j].comment)
                                });
                            }
                        }
                    } else {
                        log('Fetching URL from file":": ' + url);
                        var file = html.match(/file":"([\s\S]*?)"/);
                        if (file) {
                            page.appendItem(file[1].replace(/\\\//g, '/'), 'video', {
                                title: new showtime.RichText(unescape(title))
                            });
                        } else {
                            log('Fetching URL from pl":": ' + url);
                            var pl = html.match(/pl":"([\s\S]*?)"/)[1].replace(/\\\//g, '/');
                            var json = showtime.JSONDecode(showtime.httpReq(pl).toString().trim());
                            for (var i in json.playlist) {
                                if (json.playlist[i].file) {
                                    page.appendItem(json.playlist[i].file.split(' ')[0], 'video', {
                                        title: new showtime.RichText(json.playlist[i].comment)
                                    });
                                }
                                for (var j in json.playlist[i].playlist) {
                                    //log(json.playlist[i].playlist[j].comment);
                                    page.appendItem(json.playlist[i].playlist[j].file.split(' ')[0], 'video', {
                                        title: new showtime.RichText(json.playlist[i].comment + ' - ' + json.playlist[i].playlist[j].comment)
                                    });
                                }
                            }
                        }
                    }
                }
            } else {
                for (i in url) {
                    page.appendItem(url[i], 'video', {
                        title: new showtime.RichText(unescape(title) + ' #' + n)
                    });
                    n++;
                }
            }
        } else {
            html = html.split('\n');
            for (var i = 0; i < html.length; i++) {
                if (!html[i].trim()) continue;
                page.appendItem(html[i].trim(), 'video', {
                    title: new showtime.RichText(unescape(title) + ' #' + n)
                });
                n++;
            }
        }
        page.loading = false;
    });

    var epgForTitle = '';

    function getEpg(region, channelId) {
        var description = '';
        if (service.disableEPG) return description;
        try {
            var epg = showtime.httpReq('https://tv.yandex.ua/' + region + '/channels/' + channelId);
            // 1-time, 2-title
            var re = /tv-event_wanna-see_check i-bem[\s\S]*?<span class="tv-event__time">([\s\S]*?)<\/span><div class="tv-event__title"><div class="tv-event__title-inner">([\s\S]*?)<\/div>/g;
            var match = re.exec(epg);
            var first = true;
            while (match) {
                if (first) {
                    epgForTitle = coloredStr(' (' + match[1] + ') ' + match[2], orange);
                    first = false;
                }
                description += '<br>' + match[1] + coloredStr(' - ' + match[2], orange);
                match = re.exec(epg);
            }
        } catch(err) {}
        return description;
    }

    plugin.addURI('xml:(.*):(.*)', function(page, pl, pageTitle) {
        log('Main list: ' + decodeURIComponent(pl).trim());
        setPageHeader(page, unescape(pageTitle));
        page.loading = true;
        try {
            var doc = XML.parse(showtime.httpReq(decodeURIComponent(pl)));
        } catch(err) {
            page.error(err);
            return;
        }
        if (!doc.items) {
            page.error('Cannot get proper xml file');
            return;
        }

        var categories = [];
        var category = doc.items.filterNodes('category');
        for (var i = 0; i < category.length; i++)
            categories[category[i].category_id] = category[i].category_title;

        var channels = doc.items.filterNodes('channel');
        var num = 0;
        for (var i = 0; i < channels.length; i++) {
            //if (channels[i].category_id && channels[i].category_id != 1) continue;
            var title = showtime.entityDecode(channels[i].title);
            //log(title);
            title = setColors(title);
            var playlist = channels[i].playlist_url;
            var description = channels[i].description ? channels[i].description : null;
            description = setColors(description);

            var icon = null;
            if (channels[i].logo_30x30 && channels[i].logo_30x30.substr(0, 4) == 'http')
                icon = channels[i].logo_30x30;
            if (!icon && channels[i].logo && channels[i].logo.substr(0, 4) == 'http')
                icon = channels[i].logo;
            if (!icon && description) {
               icon = description.match(/src="([\s\S]*?)"/)
               if (icon) icon = showtime.entityDecode(icon[1]);
            }

            // show epg if available
            epgForTitle = '';
            if (channels[i].region && +channels[i].description)
                description = getEpg(channels[i].region, channels[i].description);
            description = description.replace(/<img[\s\S]*?src=[\s\S]*?(>|$)/, '').replace(/\t/g, '').replace(/\n/g, '').trim();

            genre = channels[i].category_id ? categories[channels[i].category_id] : null;
            if (playlist && playlist != 'null' && !channels[i].parser) {
                var extension = playlist.split('.').pop().toLowerCase();
                if (extension != 'm3u')
                    extension = 'xml';
                var url = extension + ':' + encodeURIComponent(playlist) + ':' + escape(title);
                page.appendItem(url, 'video', {
                    title: new showtime.RichText(title + epgForTitle),
                    icon: icon,
                    genre: genre,
                    description: new showtime.RichText((playlist ? coloredStr('Link: ', orange) + playlist + '\n' : '') + description)
                });
            } else {
                if (channels[i].parser)
                    page.appendItem(PREFIX + ':parse:' + escape(channels[i].parser) + ':' + escape(title), 'directory', {
                        title: new showtime.RichText(title + epgForTitle),
                        genre: genre
                    });
                else {
                    var url = channels[i].stream_url ? channels[i].stream_url : '';
                    var match = url.match(/http:\/\/www.youtube.com\/watch\?v=(.*)/);
                    if (match) {
                        url = 'youtube:video:' + match[1];
                        page.appendItem(url, 'video', {
                            title: title + epgForTitle,
                            icon: icon,
                            genre: genre,
                            description: new showtime.RichText(coloredStr('Link: ', orange) + url)
                        });
                    } else
                        addItem(page, url, title, icon, description, genre, epgForTitle);
                }
            }
            num++;
        }
        page.metadata.title = new showtime.RichText(unescape(pageTitle) + ' (' + num + ')');
        page.loading = false;
    });

    function log(str) {
        if (service.debug) showtime.trace(str);
    }

    // Search IMDB ID by title
    function getIMDBid(title) {
        var imdbid = null;
        var title = showtime.entityDecode(unescape(title)).toString();
        log('Splitting the title for IMDB ID request: ' + title);
        var splittedTitle = title.split('|');
        if (splittedTitle.length == 1)
            splittedTitle = title.split('/');
        if (splittedTitle.length == 1)
            splittedTitle = title.split('-');
        log('Splitted title is: ' + splittedTitle);
        if (splittedTitle[1]) { // first we look by original title
            var cleanTitle = splittedTitle[1];//.trim();
            var match = cleanTitle.match(/[^\(|\[|\.]*/);
            if (match)
                cleanTitle = match;
            log('Trying to get IMDB ID for: ' + cleanTitle);
            resp = showtime.httpReq('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
            imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
            if (!imdbid && cleanTitle.indexOf('/') != -1) {
                splittedTitle2 = cleanTitle.split('/');
                for (var i in splittedTitle2) {
                    log('Trying to get IMDB ID (1st attempt) for: ' + splittedTitle2[i].trim());
                    resp = showtime.httpReq('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(splittedTitle2[i].trim())).toString();
                    imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
                    if (imdbid) break;
                }
            }
        }
        if (!imdbid)
            for (var i in splittedTitle) {
                if (i == 1) continue; // we already checked that
                var cleanTitle = splittedTitle[i].trim();
                var match = cleanTitle.match(/[^\(|\[|\.]*/);
                if (match)
                    cleanTitle = match;
                log('Trying to get IMDB ID (2nd attempt) for: ' + cleanTitle);
                resp = showtime.httpReq('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
                imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
                if (imdbid) break;
            }

        if (imdbid) {
            log('Got following IMDB ID: ' + imdbid[1]);
            return imdbid[1];
        }
        log('Cannot get IMDB ID :(');
        return imdbid;
    };

    plugin.addURI(PREFIX + ":streamlive:(.*):(.*)", function(page, url, title) {
        page.loading = true;
        var doc = showtime.httpReq(unescape(url)).toString();
        var imdbid = lnk = no_subtitle_scan = 0;
        var mimetype = 'video/quicktime';
        var direct = doc.match(/<source src="([\s\S]*?)"/);
        if (direct) {
           lnk = direct[1];
           imdbid = getIMDBid(title);
        } else { 
            mimetype = 'application/vnd.apple.mpegurl'
            no_subtitle_scan = true;
            var re = /return\(([\s\S]*?)innerHTML\)/g;
            var match = re.exec(doc);
            while (match) {
                // 1-lnk, 2-array id, 3-inner id
                var tmp = match[1].match(/return\(\[([\s\S]*?)\][\s\S]*?\+ ([\s\S]*?)\.[\s\S]*?getElementById\("([\s\S]*?)"\)\./);
                if (tmp) {
                    lnk = 'hls:https:' + tmp[1].replace(/[",\s]/g, '').replace(/\\\//g, '/');
                    var re2 = new RegExp(tmp[2] + ' = ([\\s\\S]*?);');
                    var tmp2 = re2.exec(doc);
                    lnk += tmp2[1].replace(/[\[\]",\s]/g, '');
                    re2 = new RegExp(tmp[3] + '>([\\s\\S]*?)<\/span>');
                    tmp2 = re2.exec(doc);
                    lnk += tmp2[1];
                log(lnk);

                }
                match = re.exec(doc);
            }
        }
        page.loading = false;
        page.type = 'video';
        page.source = "videoparams:" + showtime.JSONEncode({
            title: unescape(title),
            canonicalUrl: PREFIX + ':streamlive:' + url + ':' + title,
            imdbid: imdbid,
            sources: [{
                url: lnk,
                mimetype: mimetype
            }],
            no_subtitle_scan: no_subtitle_scan
        });
    });

    plugin.addURI(PREFIX + ":streamliveStart", function(page) {
        setPageHeader(page, 'StreamLive.to');
        page.loading = true;

        plugin.addHTTPAuth('.*streamlive\\.to.*', function(req) {
            req.setHeader('Host', req.url.replace('http://','').replace('https://','').split(/[/?#]/)[0]);
            req.setHeader('Origin', 'https://www.streamlive.to');
            req.setHeader('Referer', 'https://www.streamlive.to/channels?list=free');
            //req.setHeader('X-Requested-With', 'XMLHttpRequest');
            req.setHeader('User-Agent', UA);
        });

        var fromPage = 1, tryToSearch = true;
        page.entries = 0;

        function loader() {
            if (!tryToSearch) return false;
            page.loading = true;
            var doc = showtime.httpReq('https://www.streamlive.to/channelsPages.php', {
                postdata: {
                    page: fromPage,
                    category: '',
                    language: '',
                    sortBy: 1,
                    query: '',
                    list: 'free'         
                }
            }).toString();
            page.loading = false;

            // 1-icon, 2-lnk, 3-title, 4-what's on, 5-viewers, 6-totalviews, 7-genre, 8-language
            var re = /<div class="icon-box">[\s\S]*?src="([\s\S]*?)"[\s\S]*?class="ser-text"><a href="([\s\S]*?)">([\s\S]*?)<br\/>([\s\S]*?)<\/a>[\s\S]*?<\/i>([\s\S]*?)&nbsp[\s\S]*?<\/i>([\s\S]*?)<br\/>[\s\S]*?<a href="[\s\S]*?">([\s\S]*?)<\/a>[\s\S]*?<a href="[\s\S]*?">([\s\S]*?)<\/a>/g;
            match = re.exec(doc);
            var added = 0;
            while (match) {
                page.appendItem(PREFIX + ':streamlive:' + escape(match[2]) + ':' + escape(trim(match[3])), "video", {
                    title: trim(match[3]),
                    icon: 'https:' + match[1],
                    genre: trim(match[7]),
                    description: new showtime.RichText(
                        (trim(match[4]) ? coloredStr('Now: ', orange) + trim(match[4].replace(/&nbsp;/g, '')).replace(/^"|"$/g, '') : '') +
                        coloredStr('\nViewers: ', orange) + trim(match[5]) +
                        coloredStr(' Total views: ', orange) + trim(match[6]) +
                        coloredStr('\nLanguage: ', orange) + trim(match[8]))
                });
                match = re.exec(doc);
                page.entries++;
                added++;
            };
            page.metadata.title = 'StreamLive.to (' + page.entries + ')';
            if (!added) return tryToSearch = false;
            fromPage++;
            return true;
        }
        loader();
        page.paginator = loader;
        page.loading = false;
    });

    function addActionToTheItem(page, menuText, id, type) {
        page.options.createAction('addPlaylist' + type, menuText, function() {
            var result = showtime.textDialog('Enter the URL to the playlist like:\n' +
                'http://bit.ly/' + id + ' or just bit.ly/' + id + ' or ' + id, true, true);
            if (!result.rejected && result.input) {
                var link = result.input;
                if (!link.match(/\./))
                    link = 'http://bit.ly/' + link;
                if (!link.match(/:\/\//))
                    link = 'http://' + link;
                var result = showtime.textDialog('Enter the name of the playlist:', true, true);
                if (!result.rejected && result.input) {
                    var entry = showtime.JSONEncode({
                        title: encodeURIComponent(result.input),
                        link: type.toLowerCase() + ':' + encodeURIComponent(link)
                    });
                    playlists.list = showtime.JSONEncode([entry].concat(eval(playlists.list)));
                    showtime.notify("Playlist '" + result.input + "' has been added to the list.", 2);
                    page.flush();
                    page.redirect(PREFIX + ':start');
                }
            }
        });
    }

    var idcJson;

    plugin.addURI(PREFIX + ":idcPlay:(.*):(.*)", function(page, id, title) {
        page.loading = true;
        var json = showtime.JSONDecode(showtime.httpReq('http://iptvn.idc.md/api/json/get_url?cid=' + id));
        page.type = 'video'
        var link = "videoparams:" + showtime.JSONEncode({
            title: decodeURI(title),
            no_fs_scan: true,
            canonicalUrl: PREFIX + ':idcPlay:' + id + ':' + title,
            sources: [{
                url: unescape(json.url).replace('http/ts', 'http'),
                mimetype: 'video/mp2t'
            }],
            no_subtitle_scan: true
        });
        page.source = link;
        page.loading = false;
    });


    function getEpgPeriod(ts1, ts2, epg) {
        if (!ts1 || !ts2 || !epg) return '';
        function tsToTime(ts) {
            var a = new Date(ts * 1000);
            return (a.getHours() < 10 ? '0' + a.getHours() : a.getHours()) + ':' + (a.getMinutes() < 10 ? '0' + a.getMinutes() : a.getMinutes());
        }
        return ' (' + tsToTime(ts1) + '-' + tsToTime(ts2) + ') ' + epg;
    }

    plugin.addURI(PREFIX + ":idcGroups:(.*)", function(page, id) {
        page.loading = true;
        var counter = 0;
        if (!idcJson) getIdc(page, 'https://iptvn.idc.md/api/json/channel_list');
        for (var i in idcJson.groups) {
            if (idcJson.groups[i].id != id)
                continue;
            if (counter == 0)
                setPageHeader(page, coloredStr(decodeURI(idcJson.groups[i].name), idcJson.groups[i].color.replace('#000000', '#FFFFFF')));
            for (var j in idcJson.groups[i].channels) {
                var lines = decodeURI(idcJson.groups[i].channels[j].epg_progname).split('\n');
                page.appendItem(PREFIX + ":idcPlay:" + idcJson.groups[i].channels[j].id + ':' + idcJson.groups[i].channels[j].name, "video", {
                    title: new showtime.RichText(decodeURI(idcJson.groups[i].channels[j].name) +
                        coloredStr(getEpgPeriod(idcJson.groups[i].channels[j].epg_start, idcJson.groups[i].channels[j].epg_end, lines[0]) , orange)),
                    icon: 'http://iptvn.idc.md' + idcJson.groups[i].channels[j].icon,
                    description: idcJson.groups[i].channels[j].epg_progname ? decodeURI(idcJson.groups[i].channels[j].epg_progname) : null
                });
                counter++;
            }
            break;
        };
        page.metadata.title = new showtime.RichText(page.metadata.title + ' (' + counter + ')');
        page.loading = false;
    });

    function getIdc(page, url) {
        showDialog = false;
        while(1) {
            page.loading = true;
            idcJson = showtime.JSONDecode(showtime.httpReq(url));
            if (!idcJson.error)
                return true;

            while(1) {
                page.loading = false;
                var credentials = plugin.getAuthCredentials(PREFIX, 'Idc.md requires login to continue', showDialog, 'idc');
                if (credentials.rejected) {
                    page.error('Cannot continue without login/password :(');
                    return false;
                }

                if (credentials && credentials.username && credentials.password) {
                    page.loading = true;
                    var resp = showtime.JSONDecode(showtime.httpReq('https://iptvn.idc.md/api/json/login', {
                        postdata: {
                            login: credentials.username,
                            pass: credentials.password,
                            settings: 'all'
                        }
                    }));
                    page.loading = false;
                    if (!resp.error) break;
                    showtime.message(resp.error.message, true);
                }
                showDialog = true;
            }
        }
    }

    plugin.addURI(PREFIX + ":idcStart", function(page) {
        setPageHeader(page, 'Idc.md');
        page.loading = true;
        if (!getIdc(page, 'https://iptvn.idc.md/api/json/channel_list')) return;
        var counter = 0;
        for (var i in idcJson.groups) {
            page.appendItem(PREFIX + ":idcGroups:" + idcJson.groups[i].id, "directory", {
                title: new showtime.RichText(coloredStr(decodeURI(idcJson.groups[i].name), idcJson.groups[i].color.replace('#000000', '#FFFFFF')))
            });
            counter++;
        };
        page.metadata.title = 'Idc.md (' + counter + ')';
        page.loading = false;
    });

    function unpack(doc) {
        var document = this;
        document.write = function(a) {
showtime.print('ddddd');
        };
var LiNLcdbieT = "YkZ5bXE1NmQzSmxZZUtyTm10bGxWYUhhb3A2bVpGcDByOUtackpXSW9xeW0zK2lman;FYcm5hT3RtWVp5M1p5aXJXWmFjckNrenR0cWlIT25uYUNvYWx5bTJhSEsyV2haY0E9PQ__";
var aZXSPTZMVU = LiNLcdbieT.split(";");
function RULhTbdULa(aXjNjLQKTV){
eval(aXjNjLQKTV);
}
var _0x3703=['<iframe src="http://www.'+(![]+[])[!+[]+!+[]+!+[]]+(![]+[])[+!+[]]+(+(!+[]+!+[]+!+[]+[!+[]+!+[]]))[(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(+![]+([]+[])[([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(+![]+[![]]+([]+[])[([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]])[!+[]+!+[]+[+[]]]](!+[]+!+[]+!+[]+[!+[]+!+[]+!+[]])+(![]+[])[!+[]+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(+(!+[]+!+[]+!+[]+[+!+[]]))[(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(+![]+([]+[])[([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(+![]+[![]]+([]+[])[([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]])[!+[]+!+[]+[+[]]]](!+[]+!+[]+!+[]+[!+[]+!+[]])+(!![]+[])[!+[]+!+[]+!+[]]+(+(+!+[]+[+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+[!+[]+!+[]]+[+[]])+[])[+!+[]]+(!![]+[])[+[]]+(+(!+[]+!+[]+!+[]+[+!+[]]))[(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(+![]+([]+[])[([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(+![]+[![]]+([]+[])[([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]])[!+[]+!+[]+[+[]]]](!+[]+!+[]+!+[]+[!+[]+!+[]])+'/embed/'+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+'/'+aZXSPTZMVU[1]+'/'+aZXSPTZMVU[0]+'" width="640" height="460" scrolling="no" frameborder="0" allowtransparency="true"></iframe>',"\x77\x72\x69\x74\x65"];_0x3704 = [_0x3703[0].replace("/strea/", (![]+[+![]])[([![]]+[][[]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(![]+[])[+!+[]]+(![]+[])[!+[]+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(![]+[])[!+[]+!+[]+!+[]]]()[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(![]+[])[+!+[]]+((+[])[([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]+[])[+!+[]+[+!+[]]]+(![]+[+![]])[([![]]+[][[]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(![]+[])[+!+[]]+(![]+[])[!+[]+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(![]+[])[!+[]+!+[]+!+[]]]()[+!+[]+[+[]]]),_0x3703[[+[]]+[]].replace("/stre/", (![]+[+![]])[([![]]+[][[]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(![]+[])[+!+[]]+(![]+[])[!+[]+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(![]+[])[!+[]+!+[]+!+[]]]()[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(![]+[])[+!+[]]+((+[])[([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]+[])[+!+[]+[+!+[]]]+(![]+[+![]])[([![]]+[][[]])[+!+[]+[+[]]]+(!![]+[])[+[]]+(![]+[])[+!+[]]+(![]+[])[!+[]+!+[]]+([![]]+[][[]])[+!+[]+[+[]]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(![]+[])[!+[]+!+[]+!+[]]]()[+!+[]+[+[]]])];
RULhTbdULa(document[_0x3703[1]](_0x3704[1]))

        //eval(doc);
    }

    plugin.addURI(PREFIX + ":playgoAtDee:(.*):(.*)", function(page, url, title) {
        page.loading = true;
        page.metadata.title = unescape(title);
        var link = null;
        var doc = showtime.httpReq('http://goatd.net/' + unescape(url)).toString();
        match = doc.match(/swidth=[\s\S]*?src="([\s\S]*?)"/); // extract embed url
        if (match) { 
            log(match[1]);
            doc = showtime.httpReq(match[1], { // loading document.write redirect page
                headers: {
                    Host: 'www.sawlive.tv',
                        Referer: 'http://goatd.net/' + unescape(url),
                        'User-Agent': UA
                }
            }).toString();
            match = doc.match(/var[\s\S]*?"([\s\S]*?);([\s\S]*?)"/);
            // fetching crypted html
            var referer = 'http://www.sawlive.tv/embed/stream/' + match[2] + '/' + match[1];
            doc = showtime.httpReq(referer, {
                headers: {
                    Host: 'www.sawlive.tv',
                    Referer: 'http://goatd.net/' + unescape(url),
                    'User-Agent': UA
                }, debug: service.debug
            }).toString();
            log(doc);

            // 1-streamer, 2-playpath
            match = doc.match(/sowrite\("[\s\S]*?", "([\s\S]*?)", "([\s\S]*?)"/);
            if (match) {
                var playpath = match[1].replace('17264311', '').replace('11123346', '');
                var link = match[2] + ' playpath=' + playpath + ' swfUrl=http://static3.sawlive.tv/player.swf pageUrl=' + referer;
            }
        }
        page.loading = false;
        if (link) {
            log(link);
            link = "videoparams:" + showtime.JSONEncode({
                title: unescape(title),
                no_fs_scan: true,
                canonicalUrl: PREFIX + ':playgoAtDee:' + url + ':' + title,
                sources: [{
                    url: link.indexOf('m3u8') >= 0 ? 'hls:' + link : link
                }],
                no_subtitle_scan: true
            });
            page.type = 'video';
            page.source = link;
        } else
            page.error("Can't get the link :( Maybe stream is offline?");
    });

    plugin.addURI(PREFIX + ":goAtDeeStart", function(page) {
        setPageHeader(page, 'goATDee.Net');
        page.loading = true;
        var doc = showtime.httpReq('http://goatd.net').toString();
        page.appendItem("", "separator", {
            title: doc.match(/<b>([\s\S]*?)<\/b>/)[1]
        });
        // 1-am/pm time, 2-est time, 3-icon, 4-link, 5-title, 6-cet time
        var re = /<td align="right"><b>([\s\S]*?)<\/b><\/td><td align="left"><b>([\s\S]*?)<\/b><\/td>[\s\S]*?<img src="([\s\S]*?)"[\s\S]*?<a href="([\s\S]*?)"[\s\S]*?blank">([\s\S]*?)<\/a>([\s\S]*?)<\/tr>/g;
        // 1- 6-24h time, 2-cet time
        var re2 = /<td align="right"><b>([\s\S]*?)<\/b><\/td><td align="left"><b>([\s\S]*?)<\/b>/;
        var match = re.exec(doc);
        while (match) {
            var params = re2.exec(match[6]);
            cet = '';
            if (params)
                cet = ' / ' + params[1] + ' ' + params[2];
	    page.appendItem(PREFIX + ":playgoAtDee:" + escape(match[4]) + ':' + escape(match[5]), "video", {
	        title: new showtime.RichText(match[5] + (match[1] ? coloredStr(' ' + match[1] + ' ' + match[2] + cet, orange) : '')),
                icon: match[3],
                description: new showtime.RichText(match[5] + (match[1] ? coloredStr(' ' + match[1] + ' ' + match[2] + cet, orange) : ''))
	    });
            match = re.exec(doc);
        }
        page.loading = false;
    });

    // Start page
    plugin.addURI(PREFIX + ":start", function(page) {
        setPageHeader(page, plugin.getDescriptor().title);
	//page.appendItem(PREFIX + ":favorites", "directory", {
	//    title: "My Favorites"
	//});

        page.appendItem("", "separator", {
            title: 'M3U & XML playlists'
        });

        addActionToTheItem(page, 'Add M3U playlist', '1Hbuve6', 'M3U');
        addActionToTheItem(page, 'Add XML playlist', '1zVA91a', 'XML');

        // menu to delete playlists
        page.options.createAction('rmPlaylist', 'Remove playlist...', function() {
            var list = eval(playlists.list);
            for (var i in list) {
                var result = showtime.message("Do you want to remove '" + decodeURIComponent(showtime.JSONDecode(list[i]).title) + "' playlist?", true, true);
                if (result) {
                    showtime.notify("'" + decodeURIComponent(showtime.JSONDecode(list[i]).title) + "' has been removed from from the list.", 2);
                    list.splice(i, 1);
                    playlists.list = showtime.JSONEncode(list);
                    page.flush();
	            page.redirect(PREFIX + ':start');
                }
            }
            if (!i) showtime.notify('There are no playlists to delete.', 2);
        });

        if (!service.disableSampleList) {
            var item = page.appendItem('m3u:http%3A%2F%2Fbit.ly%2F1Hbuve6:Sample M3U list', "directory", {
                title: 'Sample M3U list'
            });
        }

        if (!service.disableSampleXMLList) {
            var item = page.appendItem('xml:http%3A%2F%2Fbit.ly%2F1zVA91a:Sample XML list', "directory", {
                title: 'Sample XML list'
            });
        }

        showPlaylist(page);

        page.appendItem("", "separator", {
            title: 'Providers'
        });
	page.appendItem(PREFIX + ":streamliveStart", "directory", {
	    title: "StreamLive.to"
	});
	page.appendItem(PREFIX + ":tivixStart", "directory", {
	    title: "Tivix.co"
	});
	page.appendItem(PREFIX + ":youtvStart", "directory", {
	    title: "Youtv.com.ua"
	});
	page.appendItem(PREFIX + ":goAtDeeStart", "directory", {
	    title: "goATDee.Net"
	});
	page.appendItem(PREFIX + ":idcStart", "directory", {
	    title: "Idc.md"
	});
    });
})(this);
