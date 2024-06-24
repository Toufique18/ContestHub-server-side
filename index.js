const express = require('express');
const cors = require('cors');
const app = express();
const multer = require('multer');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
require('dotenv').config();

//const port = process.env.PORT || 5000;

// Middleware

app.use(express.json());
app.use(bodyParser.json());
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://contesthub-d205f.web.app",
    "https://contesthub-d205f.firebaseapp.com",
  ],
  credentials: true 
}));


// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mhvsuxa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Stripe setup
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function run() {
  try {
    //await client.connect();

    const contestCollection = client.db('contesthub').collection('contest_info');
    const usersCollection = client.db('contesthub').collection('user');
    const pendingCollection = client.db('contesthub').collection('pending');
    const participationCollection = client.db('contesthub').collection('participation');

    // User operations
    // Endpoint to get the number of contests a user has participated in
app.get('/participated-contests/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
      const count = await participationCollection.countDocuments({ userId });
      res.json({ count });
  } catch (error) {
      console.error('Error fetching participated contests:', error);
      res.status(500).json({ error: 'Failed to fetch participated contests' });
  }
});


// Endpoint to get the details of won contests
app.get('/won-contests-details/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const contests = await contestCollection.find({ 'winner.userId': userId }).toArray();
    res.status(200).json({ contests });
  } catch (error) {
    console.error('Error fetching won contests details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Endpoint to get the number of contests a user has won
app.get('/won-contests/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
      const count = await contestCollection.countDocuments({ 'winner.userId': userId });
      res.json({ count });
  } catch (error) {
      console.error('Error fetching won contests:', error);
      res.status(500).json({ error: 'Failed to fetch won contests' });
  }
});

    // Fetch accepted contests for a user
app.get('/fetch-accepted-contests/:email', async (req, res) => {
  try {
    const contests = await contestCollection.find({ email: req.params.email }).toArray();
    res.json(contests);
  } catch (error) {
    console.error('Error fetching accepted contests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch participants for a specific contest
app.get('/participated-contests/:contestId', async (req, res) => {
  const { contestId } = req.params;

  try {
    const participants = await participationCollection.find({ contestId: contestId }).toArray();
    res.json(participants);
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

// Declare a winner for a contest
app.post('/declare-winner', async (req, res) => {
  const { contestId, winner } = req.body;

  try {
    // Check if the contest exists
    const contest = await contestCollection.findOne({ _id: new ObjectId(contestId) });

    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    // Ensure the deadline has passed
    if (new Date(contest.deadline) > new Date()) {
      return res.status(400).json({ error: 'Deadline is not over yet' });
    }

    // Update contest winner in contestCollection
    const updateContestResult = await contestCollection.updateOne(
      { _id: new ObjectId(contestId) },
      { $set: { winner } }
    );

    if (updateContestResult.modifiedCount !== 1) {
      return res.status(500).json({ error: 'Failed to update contest' });
    }

    // Update participant in participationCollection
    const updateParticipantResult = await participationCollection.updateOne(
      { contestId: contestId, userId: winner.userId },
      { $set: { winner: true } }
    );

    if (updateParticipantResult.modifiedCount !== 1) {
      return res.status(500).json({ error: 'Failed to update participant' });
    }

    res.status(200).json({ message: 'Winner declared successfully' });
  } catch (error) {
    console.error('Error declaring winner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


    // Fetch all contests
   app.get("/contest_info", async (req, res) => {
  try {
    const result = await contestCollection.find().toArray();
    res.json(result);
  } catch (error) {
    console.error('Error fetching contest info:', error);
    res.status(500).send({ error: 'Failed to fetch contest info' });
  }
});

app.post('/submit-url', async (req, res) => {
  const { contestId, userId, url } = req.body;

  if (!contestId || !userId || !url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await participationCollection.updateOne(
      { contestId, userId },
      { $set: { submissionUrl: url } }
    );

    if (result.modifiedCount === 1) {
      res.status(200).json({ message: 'URL submitted successfully' });
    } else {
      throw new Error('Failed to submit URL');
    }
  } catch (error) {
    console.error('Error submitting URL:', error);
    res.status(500).json({ error: error.message });
  }
});
    // Create a new user
    app.post("/users", async (req, res) => {
      const { email } = req.body;
      const existingUser = await usersCollection.findOne({ email });

      if (existingUser) {
        res.status(200).send({ message: 'User already exists' });
      } else {
        const result = await usersCollection.insertOne(req.body);
        res.status(201).send(result);
      }
    });

    // Update user role
    app.patch("/users/:id/role", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    // Delete a user
    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Fetch all users
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Error fetching users" });
      }
    });

    // Contest operations

    // Add contest
app.post('/add-contest', async (req, res) => {
    try {
        const { contestName, description, price, prizeMoney, taskInstruction, selectedTag, deadline, email, image } = req.body;

        const result = await pendingCollection.insertOne({
            contestName,
            description,
            price,
            prizeMoney,
            taskInstruction,
            selectedTag,
            deadline,
            email,
            image,
            createdAt: new Date(),
        });

        console.log('Contest added to pending collection:', result);

        // Respond with success status
        res.status(200).json({ message: 'Contest added successfully' });
    } catch (error) {
        console.error('Error adding contest:', error);
        res.status(500).json({ error: 'An error occurred while adding the contest' });
    }
});





    // Confirm contest
    app.put('/confirm-contest/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const contest = await pendingCollection.findOne({ _id: new ObjectId(id) });
        if (!contest) {
          return res.status(404).json({ error: 'Contest not found' });
        }

        const deleteResult = await pendingCollection.deleteOne({ _id: new ObjectId(id) });
        if (deleteResult.deletedCount !== 1) {
          return res.status(500).json({ error: 'Failed to delete contest from pending collection' });
        }

        const insertResult = await contestCollection.insertOne(contest);
        if (!insertResult.acknowledged) {
          return res.status(500).json({ error: 'Failed to insert contest into contest_info collection' });
        }

        res.status(200).json({ success: true });
      } catch (error) {
        console.error('Error confirming contest:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

   // Create payment intent
  app.post('/create-payment-intent', async (req, res) => {
    const { amount, email, name, photoURL } = req.body;

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        receipt_email: email,
        metadata: { name, photoURL },
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error('Error creating payment intent:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

 // Payment confirmation endpoint
app.post('/confirm-payment', async (req, res) => {
    try {
        const { paymentIntentId, email, name, photoURL, userId, contestId } = req.body;
        console.log('Received confirmation data:', { paymentIntentId, email, name, photoURL, userId, contestId });

        if (!userId || !contestId) {
            return res.status(400).json({ error: 'userId and contestId are required' });
        }

        // Check if contestId is a valid ObjectId
        if (!ObjectId.isValid(contestId)) {
            return res.status(400).json({ error: 'Invalid contestId' });
        }

        // Save participation and increment participant count in contestCollection
        const participation = {
            userId,
            contestId,
            email,
            name,
            photoURL,
            paymentIntentId,
            createdAt: new Date() // Add a createdAt timestamp
        };

        const result = await participationCollection.insertOne(participation);

        if (result.insertedCount === 1) {
            // Increment participant count in contestCollection atomically
            const updateResult = await contestCollection.updateOne(
                { _id: new ObjectId(contestId) },
                { $inc: { participantCount: 1 } }
            );

            if (updateResult.modifiedCount === 1) {
                res.status(200).json({ message: 'Participation saved and participant count updated successfully' });
            } else {
                console.error('Failed to update participant count:', updateResult);
                throw new Error('Failed to update participant count');
            }
        } else {
            console.error('Failed to save participation:', result);
            throw new Error('Failed to save participation');
        }
    } catch (error) {
        console.error('Error confirming payment:', error);
        res.status(500).json({ error: error.message });
    }
});
  

  
  





    // Fetch contests created by a specific user
    app.get("/fetch-my-contests/:email", async (req, res) => {
      const result = await pendingCollection.find({ email: req.params.email }).toArray();
      res.send(result);
    });

    // Server-side code to fetch accepted contests
app.get('/fetch-accepted-contests/:email', async (req, res) => {
    
    try {
        const contests = await contestCollection.find({ email: req.params.email }).toArray();
        res.json(contests);
    } catch (error) {
        console.error('Error fetching accepted contests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


    // Fetch participated contests for a specific user
    // Fetch participated contests for a specific user by email
    app.get('/participated-contests-by-email/:email', async (req, res) => {
      const { email } = req.params;

      try {
        const participations = await participationCollection.find({ email }).toArray();
        const contestIds = participations.map(participation => new ObjectId(participation.contestId));
        const contests = await contestCollection.find({ _id: { $in: contestIds } }).toArray();
        res.json(contests);
      } catch (error) {
        console.error('Error fetching participated contests:', error);
        res.status(500).json({ error: 'Failed to fetch participated contests' });
      }
    });

    // Delete pending contest
    app.delete("/pending/:id", async (req, res) => {
      const { id } = req.params;
      const result = await pendingCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Fetch all pending contests
    app.get("/pending", async (req, res) => {
      const result = await pendingCollection.find().toArray();
      res.send(result);
    });

    // Fetch all contests (including pending and confirmed)
    app.get("/fetch-all-contests", async (req, res) => {
      try {
        const result = await pendingCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching contests:', error);
        res.status(500).send({ error: 'Failed to fetch contests' });
      }
    });

    // Add comment to contest
    app.post("/add-comment/:id", async (req, res) => {
      const { id } = req.params;
      const { comment } = req.body;

      try {
        const result = await pendingCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { comments: comment } }
        );
        res.send(result);
      } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).send({ error: 'Failed to add comment' });
      }
    });

    // Update pending contest
    app.put("/pending/:id", upload.single('image'), async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedInfo = req.body;
      const image = req.file;

      const updateData = {
        $set: {
          contestName: updatedInfo.contestName,
          description: updatedInfo.description,
          price: updatedInfo.price,
          prizeMoney: updatedInfo.prizeMoney,
          taskInstruction: updatedInfo.taskInstruction,
          selectedTag: updatedInfo.selectedTag,
          deadline: new Date(updatedInfo.deadline),
          email: updatedInfo.email,
        }
      };

      if (image) {
        updateData.$set.image = image.buffer;
        updateData.$set.imageType = image.mimetype;
      }

      const result = await pendingCollection.updateOne(filter, updateData, options);
      res.send(result);
    });

     // Endpoint to check if a user is an admin
     app.get('/users/admin/:email', async (req, res) => {
      const { email } = req.params;
      try {
          const user = await usersCollection.findOne({ email });
          if (user && user.role === 'admin') {
              res.json({ admin: true });
          } else {
              res.json({ admin: false });
          }
      } catch (error) {
          console.error('Error checking admin status:', error);
          res.status(500).json({ error: 'Internal server error' });
      }
  });

  // Endpoint to check if a user is a contest creator
  app.get('/users/contest_creator/:email', async (req, res) => {
      const { email } = req.params;
      try {
          const user = await usersCollection.findOne({ email });
          if (user && user.role === 'contest_creator') {
              res.json({ contestCreator: true });
          } else {
              res.json({ contestCreator: false });
          }
      } catch (error) {
          console.error('Error checking contest creator status:', error);
          res.status(500).json({ error: 'Internal server error' });
      }
  });

  // Endpoint to check if a user has a regular user role
  app.get('/users/user/:email', async (req, res) => {
      const { email } = req.params;
      try {
          const user = await usersCollection.findOne({ email });
          if (user && user.role === 'user') {
              res.json({ user: true });
          } else {
              res.json({ user: false });
          }
      } catch (error) {
          console.error('Error checking user status:', error);
          res.status(500).json({ error: 'Internal server error' });
      }
  });

    
    

    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

// Root endpoint
app.get('/', (req, res) => {
  res.send('Contesthub server is running');
});
const port = process.env.PORT || 5000;

// Start server
app.listen(port, () => {
  console.log(`Contesthub server is running on port: ${port}`);
});
