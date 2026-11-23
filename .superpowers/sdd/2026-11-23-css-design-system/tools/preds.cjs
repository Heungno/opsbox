const E='(?![\\w-])';
const LAYOUT=new RegExp(`#sidebar|\\.sidebar|#theme-toggle|\\.layout${E}|\\.content${E}|\\.container${E}|\\.header${E}|\\.logo${E}|\\.menu-|\\.theme-toggle|\\.icon-|a\\[data-menu|\\.settings-menu|mobile-`);
const NOT_LAYOUT=/-page(?![\w-])|\.login-/;
const core=s=>s.replace(/^:root(\[[^\]]*\])?\s*/,'');
const TABLE=/^(table|th|td|thead|tbody|tr)\b/;
const isBase=u=>!u.raw && !/[.#]/.test(core(u.selector)) && !TABLE.test(core(u.selector)) && !/data-menu/.test(u.selector) && !/max-width/.test(u.media);
const isLayout=u=>!u.raw && LAYOUT.test(u.selector) && !NOT_LAYOUT.test(u.selector);
module.exports={isBase,isLayout};
