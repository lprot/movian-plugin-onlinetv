// Finds JSON/JS objects containing two keys for source and label
function findSourcesList(text, source, label) {
  var retval = [];
  reg = new RegExp('\\{[^{]*'+source+'["\']? *:[^{]+'+label+'["\']? *:[^}]+\\}|\\{[^{]*'+label+'["\']? *:[^{]+'+source+'["\']? *:[^}]+\\}', 'g');
  do {
    m = reg.exec(text);

    if (m) {
      retval.push(m[0].match(new RegExp(label+'["\']? *: *["\']([^"\']*)'))[1]);
      var link = m[0].match(new RegExp(source+'["\']? *: *["\']([^"\']*)'))[1];
      link = link.replace(/\\/g, ''); // strip backslashes
      retval.push(link);
    }
  } while(m);

  if (retval.length > 0) {
    return retval;
  } else {
    return null;
  }
}

exports.findSourcesList = findSourcesList;
