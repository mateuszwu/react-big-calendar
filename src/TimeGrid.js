import PropTypes from 'prop-types';
import React, { Component } from 'react';
import cn from 'classnames';
import { findDOMNode } from 'react-dom';

import dates from './utils/dates';
import localizer from './localizer'
import DayColumn from './DayColumn';
import TimeColumn from './TimeColumn';
import Header from './Header';

import getWidth from 'dom-helpers/query/width';
import scrollbarSize from 'dom-helpers/util/scrollbarSize';

import { accessor, dateFormat } from './utils/propTypes';

import { notify } from './utils/helpers';

import { accessor as get } from './utils/accessors';

import { segStyle } from './utils/eventLevels';

export default class TimeGrid extends Component {

  static propTypes = {
    events: PropTypes.array.isRequired,

    step: PropTypes.number,
    range: PropTypes.arrayOf(
      PropTypes.instanceOf(Date)
    ),
    min: PropTypes.instanceOf(Date),
    max: PropTypes.instanceOf(Date),
    now: PropTypes.instanceOf(Date),

    scrollToTime: PropTypes.instanceOf(Date),
    eventPropGetter: PropTypes.func,
    dayFormat: dateFormat,
    showMultiDayTimes: PropTypes.bool,
    culture: PropTypes.string,

    rtl: PropTypes.bool,
    width: PropTypes.number,

    titleAccessor: accessor.isRequired,
    allDayAccessor: accessor.isRequired,
    startAccessor: accessor.isRequired,
    endAccessor: accessor.isRequired,

    selected: PropTypes.object,
    selectable: PropTypes.oneOf([true, false, 'ignoreEvents']),
    longPressThreshold: PropTypes.number,

    onNavigate: PropTypes.func,
    onSelectSlot: PropTypes.func,
    onSelectEnd: PropTypes.func,
    onSelectStart: PropTypes.func,
    onSelectEvent: PropTypes.func,
    onDoubleClickEvent: PropTypes.func,
    onDrillDown: PropTypes.func,
    getDrilldownView: PropTypes.func.isRequired,

    messages: PropTypes.object,
    components: PropTypes.object.isRequired,
  }

  static defaultProps = {
    step: 30,
    min: dates.startOf(new Date(), 'day'),
    max: dates.endOf(new Date(), 'day'),
    scrollToTime: dates.startOf(new Date(), 'day'),
    /* these 2 are needed to satisfy requirements from TimeColumn required props
     * There is a strange bug in React, using ...TimeColumn.defaultProps causes weird crashes
     */
    type: 'gutter',
    now: new Date()
  }

  constructor(props) {
    super(props)
    this.state = { gutterWidth: undefined, isOverflowing: null };
    this.handleSelectEvent = this.handleSelectEvent.bind(this)
    this.handleDoubleClickEvent = this.handleDoubleClickEvent.bind(this)
    this.handleHeaderClick = this.handleHeaderClick.bind(this)
  }

  componentWillMount() {
    this._gutters = [];
    this.calculateScroll();
  }

  componentDidMount() {
    this.checkOverflow();

    if (this.props.width == null) {
      this.measureGutter()
    }
    this.applyScroll();
  }

  componentWillUnmount() {
    window.clearTimeout(this._timeIndicatorTimeout);
  }

  componentDidUpdate() {
    if (this.props.width == null && !this.state.gutterWidth) {
      this.measureGutter()
    }

    this.applyScroll();
  }

  componentWillReceiveProps(nextProps) {
    const { range, scrollToTime } = this.props;
    // When paginating, reset scroll
    if (
      !dates.eq(nextProps.range[0], range[0], 'minute') ||
      !dates.eq(nextProps.scrollToTime, scrollToTime, 'minute')
    ) {
      this.calculateScroll();
    }
  }

  handleSelectAllDaySlot = (slots, slotInfo) => {
    const { onSelectSlot } = this.props;
    notify(onSelectSlot, {
      slots,
      start: slots[0],
      end: slots[slots.length - 1],
      action: slotInfo.action
    })
  }

  render() {
    let { events, range, width, now } = this.props;

    width = width || this.state.gutterWidth;

    this.slots = range.length;

    let gutterRef = ref => this._gutters[0] = ref && findDOMNode(ref);

    return (
      <div className='rbc-time-view'>

        {this.renderHeader(range, width)}

        <div ref='content' className='rbc-time-content'>

          <TimeColumn
            {...this.props}
            showLabels
            style={{ width }}
            ref={gutterRef}
            className='rbc-time-gutter'
          />

          {this.renderEvents(range, events, now)}

        </div>
      </div>
    );
  }

  renderEvents(range, events, today){
    let { min, max, endAccessor, startAccessor, components } = this.props;

    return range.map((date, idx) => {
      let daysEvents = events
        .filter(event => {
          if (date.getDay() !== event.end.getDay()) return event
          return event.end.getHours() !== 0 || event.end.getMinutes() !== 0 || event.end.getSeconds() > 0
        })
        .filter(event => dates.inRange(date, get(event, startAccessor), get(event, endAccessor), 'day'))
      return (
        <DayColumn
          {...this.props }
          min={dates.merge(date, min)}
          max={dates.merge(date, max)}
          eventComponent={components.event}
          eventWrapperComponent={components.eventWrapper}
          dayWrapperComponent={components.dayWrapper}
          className={cn({ 'rbc-now': dates.eq(date, today, 'day') })}
          style={segStyle(1, this.slots)}
          key={idx}
          date={date}
          events={daysEvents}
        />
      )
    })
  }

  renderHeader(range, width) {
    let { rtl } = this.props;
    let { isOverflowing } = this.state || {};

    let style = {};
    if (isOverflowing)
      style[rtl ? 'marginLeft' : 'marginRight'] = scrollbarSize() + 'px';

    return (
      <div
        ref='headerCell'
        className={cn(
          'rbc-time-header',
          isOverflowing && 'rbc-overflowing'
        )}
        style={style}
      >
        <div className='rbc-row'>
          <div
            className='rbc-label rbc-header-gutter'
            style={{ width }}
          />
          { this.renderHeaderCells(range) }
        </div>
      </div>
    )
  }

  renderHeaderCells(range){
    let { dayFormat, culture, components, getDrilldownView } = this.props;
    let HeaderComponent = components.header || Header

    return range.map((date, i) => {
      let drilldownView = getDrilldownView(date);
      let label = localizer.format(date, dayFormat, culture);

      let header = (
        <HeaderComponent
          date={date}
          label={label}
          localizer={localizer}
          format={dayFormat}
          culture={culture}
        />
      )

      return (
        <div
          key={i}
          className={cn(
            'rbc-header',
            dates.isToday(date) && 'rbc-today rbc-now', // edited by onursimsek94
          )}
          style={segStyle(1, this.slots)}
        >
          {drilldownView ? (
            <a
              href='#'
              onClick={e => this.handleHeaderClick(date, drilldownView, e)}
            >
              {header}
            </a>
          ) : (
            <span>
              {header}
            </span>
          )}
        </div>
      )
    })
  }

  handleHeaderClick(date, view, e){
    e.preventDefault()
    notify(this.props.onDrillDown, [date, view])
  }

  handleSelectEvent(...args) {
    notify(this.props.onSelectEvent, args)
  }

  handleDoubleClickEvent(...args) {
    notify(this.props.onDoubleClickEvent, args)
  }

  handleSelectAlldayEvent(...args) {
    //cancel any pending selections so only the event click goes through.
    this.clearSelection()
    notify(this.props.onSelectEvent, args)
  }

  clearSelection(){
    clearTimeout(this._selectTimer)
    this._pendingSelection = [];
  }

  measureGutter() {
    let width = this.state.gutterWidth;
    let gutterCells = this._gutters;

    if (!width) {
      width = Math.max(...gutterCells.map(getWidth));

      if (width) {
        this.setState({ gutterWidth: width })
      }
    }
  }

  applyScroll() {
    if (this._scrollRatio) {
      const { content } = this.refs;
      content.scrollTop = content.scrollHeight * this._scrollRatio;
      // Only do this once
      this._scrollRatio = null;
    }
  }

  calculateScroll() {
    const { min, max, scrollToTime } = this.props;

    const diffMillis = scrollToTime - dates.startOf(scrollToTime, 'day');
    const totalMillis = dates.diff(max, min);

    this._scrollRatio = diffMillis / totalMillis;
  }

  checkOverflow() {
    if (this._updatingOverflow) return;

    let isOverflowing = this.refs.content.scrollHeight > this.refs.content.clientHeight;

    if (this.state.isOverflowing !== isOverflowing) {
      this._updatingOverflow = true;
      this.setState({ isOverflowing }, () => {
        this._updatingOverflow = false;
      })
    }
  }
}
