  /*
  (The MIT License as published by OSI)

  Base64 ECMAScript codec object
  Copyright (c) 2008 Peter S. May

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
  */

  var Base64 = (function(){

  	var table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

  	// r64 char to 6-bit int
  	function rord(q,n) {
  		return (table.indexOf(q.charAt(n)) & 0x3F);
  	}
  	// 6-bit int to r64 char
  	function rchr(x) {
  		return table.charAt(0x3F & x);
  	}
  	// pbyte to 8-bit int
  	function ord(c,n) {
  		return 0xFF & c.charCodeAt(n);
  	}
  	// 8-bit int to pbyte
  	function chr(x) {
  		return String.fromCharCode(0xFF & x);
  	}
  	// 4-char r64 word to 24-bit int
  	function r64_x24(q) {
  		return (rord(q,0)<<18) | (rord(q,1)<<12) | (rord(q,2)<<6) | rord(q,3);
  	}
  	// 24-bit int to 4-char r64 word
  	function x24_r64(x) {
  		return rchr(x>>18) + rchr(x>>12) + rchr(x>>6) + rchr(x);
  	}
  	// 3-pbyte string to 24-bit int
  	function c3_x24(c) {
  		return (ord(c,0)<<16) | (ord(c,1)<<8) | ord(c,2);
  	}
  	// 24-bit int to 3-pbyte string
  	function x24_c3(x) {
  		return chr(x>>16) + chr(x>>8) + chr(x);
  	}

  	// Require strings
  	function reqstr(s) {
  		if('string' != typeof s)
  			throw "String expected";
  	}

  	// Reads 3 pbytes at a time and converts to 4 r64 chars.
  	// Pads input to a multiple of 3, then replaces the corresponding
  	// 'A' chars with '='.
  	function encode(s) {
  		reqstr(s);
  		var len = s.length;
  		var out = [];
  		for(var i = 0; i < len; i += 3) {
  			var w = x24_r64(c3_x24((s.substring(i,i+3)+"\0\0").substring(0,3)));
  			if(3 > len - i) {
  				w = (w.substring(0,1 + len - i) + "==").substring(0,4);
  			}
  			out.push(w);
  		}
  		return out.join('') || '';
  	}

  	// Reads 4 r64 chars and converts to 3 pbytes.
  	// Rejects input if it contains anything other than A-Za-z0-9+/
  	// unless it is the last word, wherein padding '=' are allowed
  	// if and only if the extraneous bits from the translation are
  	// 0. A word is rejected if it is fewer than 4 chars.
  	function decode(s) {
  		reqstr(s);
  		var len = s.length;
  		var out = [];
  		var m;
  		for(var i = 0; i < len; i += 4) {
  			var w = s.substring(i,i+4);
  			if(/^[A-Za-z0-9+\/]{4}$/.test(w)) {
  				out.push(x24_c3(r64_x24(w)));
  			}
  			else if(m = /^([A-Za-z0-9+\/]{2,3})==?$/.exec(w)) {
  				if(w.length != 4)
  					throw "Invalid length";
  				else if(len - i > 4)
  					throw "Padding may only appear at end of input";
  				w = (m[1] + "AA").substring(0,4);
  				var c3 = x24_c3(r64_x24(w));
  				var nulls = c3.substring(m[1].length-1);
  				for(var j = 0; j < nulls.length; ++j) {
  					if(nulls.charCodeAt(j) != 0)
  						throw "Garbage at end of input";
  				}
  				out.push(c3.substring(0,m[1].length-1));
  			}
  			else
  				throw "Invalid input characters or sequence";
  		}
  		return out.join('') || '';
  	}

  	return {
  		encode: encode,
  		decode: decode
  	};

  })();
  exports.Base64 = Base64;
  