const express = require('express');
const cors = require('cors');
const app = express();

const multer = require('multer');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
require('dotenv').config();

const port = process.env.PORT || 5000;

// Middleware
app.use(cors(
  {
    origin: [
      "http://localhost:5173",
      "https://contesthub-d205f.web.app",
      "https://contesthub-d205f.firebaseapp.com",
    ]
  }
));
app.use(express.json());
app.use(bodyParser.json());

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
    app.post('/add-contest', upload.single('image'), async (req, res) => {
      try {
        const { contestName, description, price, prizeMoney, taskInstruction, selectedTag, deadline, email } = req.body;
        const image = req.file;

        const contestData = {
          contestName,
          image: image.buffer,
          imageType: image.mimetype,
          description,
          price,
          prizeMoney,
          taskInstruction,
          selectedTag,
          deadline: new Date(deadline),
          email,
        };

        const result = await pendingCollection.insertOne(contestData);
        res.status(201).send(result);
      } catch (error) {
        console.error('Error adding contest:', error);
        res.status(500).send('Error adding contest');
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
      const { amount, email, name } = req.body;
    
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: 'usd',
          receipt_email: email,
          metadata: { name },
        });
    
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error('Error creating payment intent:', error.message);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Confirm payment and save participation
    app.post('/confirm-payment', async (req, res) => {
      try {
        const { paymentIntentId, email, name, userId, contestId } = req.body;
        
        // Validate that userId and contestId are not null
        if (!userId || !contestId) {
          return res.status(400).json({ error: 'userId and contestId are required' });
        }
        
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (paymentIntent.status === 'succeeded') {
          const participation = {
            userId,
            contestId,
            email,
            name,
            paymentIntentId,
          };
    
          await participationCollection.insertOne(participation);
    
          res.status(200).json({ message: 'Participation saved successfully' });
        } else {
          res.status(400).json({ message: 'Payment not successful' });
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

    // Fetch all contests
    app.get("/contest_info", async (req, res) => {
      const result = await contestCollection.find().toArray();
      res.send(result);
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

// Start server
app.listen(port, () => {
  console.log(`Contesthub server is running on port: ${port}`);
});
