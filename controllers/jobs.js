const Job = require('../models/Job')
const { StatusCodes } = require('http-status-codes')
const { BadRequestError, NotFoundError } = require('../errors')
const mongoose = require('mongoose')
const moment = require('moment')


const getAllJobs = async (req, res) => {

  const { search, jobType, status, sort } = req.query;

  const queryObject = {
    createdBy: req.user.userId
  }

  if (search) {
    /*
    regex will take in whatever is in search n do a pattern matching with
    values from DB

    i -> denotes is not case sensitive
    */
    queryObject.position = { $regex: search, $options: 'i' };
  }

  if (status && status !== 'all') {
    queryObject.status = status;
  }

  if (jobType && jobType !== 'all') {
    queryObject.jobType = jobType;
  }

  let result = Job.find(queryObject);

  if (sort === 'latest') {
    result = result.sort('-createdAt');
  }
  if (sort === 'oldest') {
    result = result.sort('createdAt');
  }
  if (sort === 'a-z') {
    result = result.sort('position');
  }
  if (sort === 'latest') {
    result = result.sort('-position');
  }

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  console.log(page, limit, skip);
  result = result.skip(skip).limit(limit);


  const jobs = await result;
  const totalJobs = await Job.countDocuments(queryObject);
  const numberOfPages = Math.ceil(totalJobs / limit);


  res.status(StatusCodes.OK).json({ jobs, totalJobs, numberOfPages })
}





const getJob = async (req, res) => {
  const {
    user: { userId },
    params: { id: jobId },
  } = req

  const job = await Job.findOne({
    _id: jobId,
    createdBy: userId,
  })
  if (!job) {
    throw new NotFoundError(`No job with id ${jobId}`)
  }
  res.status(StatusCodes.OK).json({ job })
}

const createJob = async (req, res) => {
  req.body.createdBy = req.user.userId
  const job = await Job.create(req.body)
  res.status(StatusCodes.CREATED).json({ job })
}

const updateJob = async (req, res) => {
  const {
    body: { company, position },
    user: { userId },
    params: { id: jobId },
  } = req

  if (company === '' || position === '') {
    throw new BadRequestError('Company or Position fields cannot be empty')
  }
  const job = await Job.findByIdAndUpdate(
    { _id: jobId, createdBy: userId },
    req.body,
    { new: true, runValidators: true }
  )
  if (!job) {
    throw new NotFoundError(`No job with id ${jobId}`)
  }
  res.status(StatusCodes.OK).json({ job })
}

const deleteJob = async (req, res) => {
  const {
    user: { userId },
    params: { id: jobId },
  } = req

  const job = await Job.findByIdAndRemove({
    _id: jobId,
    createdBy: userId,
  })
  if (!job) {
    throw new NotFoundError(`No job with id ${jobId}`)
  }
  res.status(StatusCodes.OK).send()
}


const showStats = async (req, res) => {
  let stats = await Job.aggregate([
    {
      $match: {
        createdBy: mongoose.Types.ObjectId(req.user.userId),
      }
    }, {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  stats = stats.reduce((acc, curr) => {
    const { _id: title, count } = curr;
    //{ pending: 27, interview: 25, declined: 24 }
    acc[title] = count
    return acc;
  }, {});

  const defaultStats = {
    pending: stats.pending || 0,
    interview: stats.interview || 0,
    declined: stats.declined || 0
  }

  let monthlyStats = await Job.aggregate([
    {
      $match: {
        createdBy: mongoose.Types.ObjectId(req.user.userId),
      }
    }, {
      $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count: { $sum: 1 },
      }
    }
    , {
      $sort: {
        '_id.year': -1,
        '_id.month': -1
      }
    }, {
      $limit: 6
    }
  ])
  
  monthlyStats = monthlyStats.map((item) => {
    const { _id : {
      year, month
    },count} = item;


    const date = moment().month(month - 1).year(year).format('MMM Y');
    return { date , count}
  }).reverse();

  res.status(StatusCodes.OK).send({ defaultStats, monthlyApplications: monthlyStats });
}

module.exports = {
  createJob,
  deleteJob,
  getAllJobs,
  updateJob,
  getJob,
  showStats,
}
