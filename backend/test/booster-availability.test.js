'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {emptySchedule,validateSchedule,validateChange,evaluateAvailability}=require('../lib/booster-availability');
const at=s=>Date.parse(s+'+08:00');
test('new boosters default offline; manual work does not require an open browser',()=>{
 assert.equal(evaluateAvailability(undefined).online,false);
 assert.equal(evaluateAvailability({mode:'manual',manual_online:1}).online,true);
 assert.equal(evaluateAvailability({mode:'manual',manual_online:1}).next_change,null);
});
test('weekly shifts are half-open Beijing-time windows independent of host timezone',()=>{
 const weekly=emptySchedule();weekly[0]=[{start:'18:00',end:'23:00'}];const row={mode:'auto',weekly_schedule:JSON.stringify(weekly)};
 for(const [time,expected] of [['2026-09-14T17:59:59',false],['2026-09-14T18:00:00',true],['2026-09-14T22:59:59',true],['2026-09-14T23:00:00',false]])assert.equal(evaluateAvailability(row,at(time)).online,expected);
 assert.equal(evaluateAvailability(row,at('2026-09-14T19:00:00')).next_change.at,'2026-09-14T15:00:00.000Z');
});
test('Sunday shifts continue across midnight and the week boundary; overlap has no false switch',()=>{
 const weekly=emptySchedule();weekly[6]=[{start:'22:00',end:'02:00'}];weekly[0]=[{start:'01:00',end:'04:00'}];
 const row={mode:'auto',weekly_schedule:weekly};
 assert.equal(evaluateAvailability(row,at('2026-09-14T00:30:00')).online,true);
 assert.equal(evaluateAvailability(row,at('2026-09-14T01:30:00')).next_change.at,'2026-09-13T20:00:00.000Z');
 assert.equal(evaluateAvailability(row,at('2026-09-14T04:00:00')).online,false);
});
test('temporary rest expires to the weekly schedule; today ends at Beijing midnight',()=>{
 const now=at('2026-09-14T19:00:00'),weekly=emptySchedule();weekly[0]=[{start:'18:00',end:'23:00'}];
 const change=validateChange({action:'temporary',online:false,hours:2},now),row={mode:'auto',weekly_schedule:weekly,...change};
 assert.equal(evaluateAvailability(row,now).source,'temporary');assert.equal(evaluateAvailability(row,now).online,false);
 assert.equal(evaluateAvailability(row,now+2*3600000).online,true);
 assert.equal(validateChange({action:'temporary',online:false,until:'today'},now).override_until,at('2026-09-15T00:00:00'));
});
test('admin pause overrides all modes and temporary work until the exact expiry',()=>{
 const now=at('2026-09-14T19:00:00'),row={mode:'manual',manual_online:1,override_online:1,override_until:now+4*3600000,admin_paused:1,admin_pause_until:now+3600000,admin_reason:'休息'};
 assert.equal(evaluateAvailability(row,now).source,'admin');assert.equal(evaluateAvailability(row,now).online,false);
 assert.equal(evaluateAvailability(row,now+3600000).online,true);
 assert.equal(evaluateAvailability({...row,admin_pause_until:null},now+86400000).online,false);
});
test('invalid schedules and durations are rejected and saving configuration clears a temporary override',()=>{
 for(const weekly of [[],Array(7).fill([{start:'25:00',end:'01:00'}]),Array(7).fill([{start:'18:00',end:'18:00'}]),Array(7).fill(Array(5).fill({start:'18:00',end:'23:00'}))])assert.throws(()=>validateSchedule(weekly));
 for(const hours of [0,3,24,'2',Infinity])assert.throws(()=>validateChange({action:'temporary',online:true,hours}));
 assert.throws(()=>validateChange({action:'configure',mode:'auto',manual_online:false,weekly_schedule:emptySchedule()}));
 const change=validateChange({action:'configure',mode:'manual',manual_online:false,weekly_schedule:emptySchedule()});
 assert.equal(change.override_until,null);assert.equal(change.override_online,null);
});
test('continuous weekly coverage has no artificial future offline boundary',()=>{
 const weekly=Array.from({length:7},()=>[{start:'00:00',end:'23:59'},{start:'23:58',end:'00:01'}]);
 const state=evaluateAvailability({mode:'auto',weekly_schedule:weekly},at('2026-09-14T19:00:00'));
 assert.equal(state.online,true);assert.equal(state.next_change,null);
});
