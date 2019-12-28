"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.specialEvents = new Map();
exports.specialEvents.set('bindtimeupdate', 'onTimeUpdate');
exports.specialEvents.set('bindgetphoneNumber', 'onGetPhoneNumber');
exports.specialEvents.set('bindgetrealnameauthinfo', 'onGetRealnameAuthInfo');
exports.specialEvents.set('bindopensetting', 'onOpenSetting');
exports.specialEvents.set('bindscancode', 'onScanCode');
exports.specialEvents.set('bindstatechange', 'onStateChange');
exports.specialEvents.set('bindhtouchmove', 'onHTouchMove');
exports.specialEvents.set('bindvtouchmove', 'onVTouchMove');
exports.specialEvents.set('bindcolumnchange', 'onColumnChange');
exports.specialEvents.set('bindscrolltoupper', 'onScrollToUpper');
exports.specialEvents.set('bindscrolltolower', 'onScrollToLower');
exports.specialEvents.set('bindanimationfinish', 'onAnimationFinish');
exports.specialEvents.set('bindfullscreenchange', 'onFullscreenChange');
exports.specialEvents.set('bindtouchstart', 'onTouchStart');
exports.specialEvents.set('bindtouchmove', 'onTouchMove');
exports.specialEvents.set('bindtouchcancel', 'onTouchCancel');
exports.specialEvents.set('bindtouchend', 'onTouchEnd');
exports.specialEvents.set('bindlongpress', 'onLongPress');
exports.specialEvents.set('bindlongclick', 'onLongClick');
exports.specialEvents.set('bindtransitionend', 'onTransitionEnd');
exports.specialEvents.set('bindanimationstart', 'onAnimationStart');
exports.specialEvents.set('bindanimationtteration', 'onAnimationIteration');
exports.specialEvents.set('bindanimationend', 'onAnimationEnd');
exports.specialEvents.set('bindtouchforcechange', 'onTouchForceChange');
exports.specialEvents.set('bindtap', 'onClick');
exports.specialEvents.forEach((value, key) => {
    exports.specialEvents.set(key.replace(/^bind/, 'catch'), value);
});
//# sourceMappingURL=events.js.map